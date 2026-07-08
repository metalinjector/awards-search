"""Модуль Кинопоиска: отчёты о премиях и поиск фильма по всем премиям.

Страницы Кинопоиска закрыты капчей, поэтому данные загружаются через
рендер-прокси r.jina.ai (markdown-версия страницы), как и в веб-версии.
Результаты кэшируются в локальные json-файлы (папка cache/).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (AwardsDesktop/1.0)"
TIMEOUT = 60
MISS_TTL = 24 * 3600  # сутки — потом страница проверяется заново

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache" / "kp"

#: Все премии Кинопоиска (slug, название) — как в веб-версии
AWARDS: list[tuple[str, str]] = [
    ("oscar", "Оскар"),
    ("golden_globes", "Золотой глобус"),
    ("bafta", "BAFTA"),
    ("cannes", "Каннский кинофестиваль"),
    ("venice", "Венецианский кинофестиваль"),
    ("berlin", "Берлинский кинофестиваль"),
    ("cesar", "Сезар"),
    ("efa", "Европейская киноакадемия"),
    ("emmy", "Эмми"),
    ("goya", "Гойя"),
    ("sag", "Гильдия киноактёров (SAG)"),
    ("saturn", "Сатурн"),
    ("mtv", "MTV"),
    ("razzie", "Золотая малина"),
    ("sundance", "Сандэнс"),
    ("karlovy_vary", "Карловы Вары"),
    ("sanseb", "Сан-Себастьян"),
    ("miff", "ММКФ"),
    ("kinotavr", "Кинотавр"),
    ("nika", "Ника"),
    ("orel", "Золотой орёл"),
    ("georges", "Жорж"),
    ("mtv_russia", "MTV Россия"),
    ("asian", "Азиатская киноакадемия"),
]
AWARD_NAMES = dict(AWARDS)

_LINK_RE = re.compile(r"\[([^\]]*)\]\((https?://[^)\s]+)\)")


# ------------------------------ модели ------------------------------

@dataclass
class Entry:
    ru: str
    en: str
    people: list[tuple[str, str]]  # (текст, url)
    films: list[tuple[str, str]]
    winner: bool


@dataclass
class Category:
    name: str
    entries: list[Entry] = field(default_factory=list)


@dataclass
class Report:
    award_name: str
    slug: str
    year: int
    source_url: str
    categories: list[Category] = field(default_factory=list)


@dataclass
class FilmMatch:
    award_name: str
    slug: str
    year: int
    source_url: str
    category: str
    entry: Entry


# --------------------------- разбор ссылки ---------------------------

def parse_award_url(url: str) -> tuple[str, int] | None:
    m = re.match(
        r"^(?:https?://)?(?:www\.)?kinopoisk\.ru/awards/([a-z0-9_\-]+)/(\d{4})/?",
        url.strip(),
        re.I,
    )
    if not m:
        return None
    return m.group(1).lower(), int(m.group(2))


# ------------------------------ загрузка ------------------------------

def _fetch_markdown(url: str) -> str:
    last: Exception = RuntimeError("fetch failed")
    for attempt in range(3):
        if attempt:
            time.sleep(2 * attempt)
        req = urllib.request.Request(
            f"https://r.jina.ai/{url}", headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
    raise last


def _parse_chunk(chunk: str) -> tuple[str, str, list, list]:
    """Разбор куска markdown: ссылки → (ru, en, people, films)."""
    people, films = [], []
    last_end = 0
    for m in _LINK_RE.finditer(chunk):
        text, url = m.group(1).strip(), m.group(2)
        if text:
            if "/name/" in url:
                people.append((text, url))
            elif "/film/" in url or "/series/" in url:
                films.append((text, url))
        last_end = m.end()
    en = re.sub(r"\*+", "", chunk[last_end:]).strip()
    ru = re.sub(r"\*+", "", _LINK_RE.sub(r"\1", chunk[:last_end])).strip()
    ru = re.sub(r"\s+", " ", ru.replace("\u00a0", " "))
    en = re.sub(r"\s+", " ", en.replace("\u00a0", " "))
    return ru, en, people, films


def _parse_report(md: str, slug: str, year: int) -> Report:
    report = Report(
        award_name=AWARD_NAMES.get(slug, slug.title()),
        slug=slug,
        year=year,
        source_url=f"https://www.kinopoisk.ru/awards/{slug}/{year}/",
    )
    current: Category | None = None
    pending: Entry | None = None

    for raw in md.split("\n"):
        line = raw.strip()
        if not line:
            continue
        cat = re.match(r"^\[\]\([^)]*\)\*\*(.+?)\*\*", line)
        if cat:
            pending = None
            current = Category(name=re.sub(r"\s+", " ", cat.group(1)).strip())
            report.categories.append(current)
            continue
        if line.startswith("![") and current is not None:
            rest = re.sub(r"^!\[[^\]]*\]\([^)]*\)", "", line)
            ru, en, people, films = _parse_chunk(rest)
            if ru or people or films:
                entry = Entry(ru=ru or en, en="", people=people, films=films, winner=True)
                current.entries.append(entry)
                pending = entry
            continue
        if line.startswith("Номинанты:") and current is not None:
            pending = None
            body = line[len("Номинанты:"):]
            for item in re.split(r"\s\*\s+", body):
                item = item.strip().lstrip("* ").strip()
                if not item:
                    continue
                ru, en, people, films = _parse_chunk(item)
                if ru or people or films:
                    current.entries.append(
                        Entry(ru=ru or en, en=en, people=people, films=films, winner=False)
                    )
            continue
        if pending is not None and not line.startswith(("[", "!")):
            if not pending.en:
                pending.en = re.sub(r"\s+", " ", line).strip()
            pending = None

    report.categories = [c for c in report.categories if c.entries]
    if not report.categories:
        raise ValueError("Страница не содержит данных о номинациях")
    return report


# ------------------------------- кэш -------------------------------

def _cache_path(slug: str, year: int) -> Path:
    return CACHE_DIR / f"{slug}-{year}.json"


def _entry_to_dict(e: Entry) -> dict:
    return {
        "ru": e.ru, "en": e.en, "people": e.people,
        "films": e.films, "winner": e.winner,
    }


def _report_to_dict(r: Report) -> dict:
    return {
        "award_name": r.award_name, "slug": r.slug, "year": r.year,
        "source_url": r.source_url,
        "categories": [
            {"name": c.name, "entries": [_entry_to_dict(e) for e in c.entries]}
            for c in r.categories
        ],
    }


def _report_from_dict(d: dict) -> Report:
    return Report(
        award_name=d["award_name"], slug=d["slug"], year=d["year"],
        source_url=d["source_url"],
        categories=[
            Category(
                name=c["name"],
                entries=[
                    Entry(
                        ru=e["ru"], en=e["en"],
                        people=[tuple(p) for p in e["people"]],
                        films=[tuple(f) for f in e["films"]],
                        winner=e["winner"],
                    )
                    for e in c["entries"]
                ],
            )
            for c in d["categories"]
        ],
    )


def fetch_report(slug: str, year: int, use_cache: bool = True) -> Report:
    """Отчёт о премии (с локальным кэшем)."""
    path = _cache_path(slug, year)
    if use_cache and path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("miss"):
            if time.time() - data.get("checked", 0) < MISS_TTL:
                raise LookupError(f"Нет данных: {slug} {year}")
        else:
            return _report_from_dict(data)

    url = f"https://www.kinopoisk.ru/awards/{slug}/{year}/"
    try:
        md = _fetch_markdown(url)
        if "Номинанты:" not in md:
            raise ValueError("нет номинаций")
        report = _parse_report(md, slug, year)
    except Exception as exc:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"miss": True, "checked": time.time()}), encoding="utf-8"
        )
        raise LookupError(f"Нет данных: {slug} {year}") from exc

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(_report_to_dict(report), ensure_ascii=False), encoding="utf-8"
    )
    return report


# --------------------------- поиск фильма ---------------------------

def _norm(s: str) -> str:
    s = s.lower().replace("ё", "е")
    return re.sub(r"[«»\"“”'’]", "", s).strip()


def scan_film(
    query: str,
    film_year: int,
    progress=None,
    stop=None,
) -> list[FilmMatch]:
    """Сканирует все премии за film_year..film_year+2 и ищет фильм.

    progress(done, total, label) — колбэк прогресса;
    stop() -> bool — необязательный флаг отмены.
    """
    years = [film_year, film_year + 1, film_year + 2]
    pages = [(slug, y) for slug, _ in AWARDS for y in years]
    total = len(pages)
    done = 0

    def load(page: tuple[str, int]) -> Report | None:
        slug, y = page
        try:
            return fetch_report(slug, y)
        except LookupError:
            return None

    reports: list[Report] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(load, p): p for p in pages}
        for fut in as_completed(futures):
            if stop and stop():
                pool.shutdown(wait=False, cancel_futures=True)
                break
            slug, y = futures[fut]
            done += 1
            if progress:
                progress(done, total, f"{AWARD_NAMES.get(slug, slug)} {y}")
            try:
                rep = fut.result()
            except Exception:
                rep = None
            if rep:
                reports.append(rep)

    q = _norm(query)
    matches: list[FilmMatch] = []
    for rep in reports:
        for cat in rep.categories:
            for e in cat.entries:
                in_films = any(q in _norm(t) for t, _ in e.films)
                in_en = q in _norm(e.en)
                film_only = not e.people and not e.films and q in _norm(e.ru)
                if in_films or in_en or film_only:
                    matches.append(
                        FilmMatch(
                            award_name=rep.award_name, slug=rep.slug, year=rep.year,
                            source_url=rep.source_url, category=cat.name, entry=e,
                        )
                    )
    matches.sort(key=lambda m: (m.year, m.award_name, not m.entry.winner))
    return matches
