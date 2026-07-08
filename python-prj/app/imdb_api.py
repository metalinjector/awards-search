"""Модуль доступа к данным IMDb.

Использует два публичных источника (без ключей):
- suggestion API IMDb  — поиск фильмов по названию;
- api.imdbapi.dev      — сведения о фильме и ВСЕ номинации на награды
                         (постраничная загрузка).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

USER_AGENT = "Mozilla/5.0 (AwardsDesktop/1.0)"
TIMEOUT = 30
RETRIES = 6          # попыток на запрос (429/5xx/сетевые сбои)
PAGE_PAUSE = 1.0     # пауза между страницами пагинации, сек (burst-лимит API)


# ----------------------------- модели -----------------------------

@dataclass
class SearchResult:
    imdb_id: str
    title: str
    year: int | None
    kind: str
    actors: str


@dataclass
class Nominee:
    name: str
    nm_id: str | None = None


@dataclass
class Nomination:
    event_name: str
    event_id: str
    year: int | None
    award_text: str
    category: str
    is_winner: bool
    nominees: list[Nominee] = field(default_factory=list)


@dataclass
class PersonInfo:
    nm_id: str
    name: str
    professions: list[str]
    birth_date: str
    biography: str


@dataclass
class FilmographyItem:
    title_id: str
    title: str
    year: int | None
    kind: str
    category: str
    characters: list[str]
    rating: float | None


@dataclass
class EventNomination:
    is_winner: bool
    titles: list[tuple[str, str, int | None]]  # (tt_id, название, год)
    names: list[tuple[str, str]]               # (nm_id, имя)


@dataclass
class EventCategory:
    award: str
    category: str
    nominations: list[EventNomination] = field(default_factory=list)


@dataclass
class EventEdition:
    event_id: str
    name: str
    year: int
    categories: list[EventCategory] = field(default_factory=list)


@dataclass
class TitleAwards:
    imdb_id: str
    title: str
    year: int | None
    rating: float | None
    plot: str
    directors: list[str]
    writers: list[str]
    stars: list[str]
    win_count: int
    nomination_count: int
    nominations: list[Nomination] = field(default_factory=list)


# --------------------------- HTTP-утилиты ---------------------------

def _get_json(url: str) -> dict:
    """GET JSON с автоматическими повторами при 429/5xx (лимиты api.imdbapi.dev)."""
    last_error: Exception = RuntimeError("request failed")
    for attempt in range(RETRIES):
        if attempt > 0:
            time.sleep(2.0 * 2 ** (attempt - 1))  # 2с, 4с, 8с, 16с, 32с
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429 or exc.code >= 500:
                continue  # повторяем
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc  # сетевые сбои тоже повторяем
    raise last_error


# ----------------------------- функции -----------------------------

def search_titles(query: str) -> list[SearchResult]:
    """Поиск фильмов/сериалов по названию через suggestion API IMDb."""
    q = query.strip()
    if len(q) < 2:
        return []
    first = q[0].lower()
    if not re.match(r"[a-z0-9]", first):
        first = "x"
    url = (
        f"https://v3.sg.media-imdb.com/suggestion/titles/{first}/"
        f"{urllib.parse.quote(q)}.json"
    )
    data = _get_json(url)
    results: list[SearchResult] = []
    for item in data.get("d", []):
        imdb_id = item.get("id", "")
        if not imdb_id.startswith("tt"):
            continue
        results.append(
            SearchResult(
                imdb_id=imdb_id,
                title=item.get("l", imdb_id),
                year=item.get("y"),
                kind=item.get("qid", item.get("q", "")),
                actors=item.get("s", ""),
            )
        )
    return results


def _people_names(items: list | None) -> list[str]:
    return [p.get("displayName", "") for p in (items or []) if p.get("displayName")]


def fetch_awards(imdb_id: str, progress=None) -> TitleAwards:
    """Загрузка сведений о фильме и всех его номинаций.

    progress — необязательный колбэк progress(loaded_count) для индикации.
    """
    if not re.match(r"^tt\d{4,12}$", imdb_id):
        raise ValueError("Некорректный IMDb ID")

    t = _get_json(f"https://api.imdbapi.dev/titles/{imdb_id}")
    result = TitleAwards(
        imdb_id=imdb_id,
        title=t.get("primaryTitle", imdb_id),
        year=t.get("startYear"),
        rating=(t.get("rating") or {}).get("aggregateRating"),
        plot=t.get("plot", ""),
        directors=_people_names(t.get("directors")),
        writers=_people_names(t.get("writers")),
        stars=_people_names(t.get("stars")),
        win_count=0,
        nomination_count=0,
    )

    token: str | None = None
    for page in range(40):  # защита от бесконечного цикла
        if page > 0:
            time.sleep(PAGE_PAUSE)  # не упираемся в burst-лимит API
        url = (
            f"https://api.imdbapi.dev/titles/{imdb_id}/awardNominations"
            f"?pageSize=50"
        )
        if token:
            url += f"&pageToken={urllib.parse.quote(token)}"
        try:
            data = _get_json(url)
        except Exception:
            # лимит посреди пагинации — возвращаем частичный список,
            # это лучше, чем ошибка на весь запрос
            if result.nominations:
                break
            raise

        stats = data.get("stats") or {}
        result.win_count = stats.get("winCount", result.win_count)
        result.nomination_count = stats.get(
            "nominationCount", result.nomination_count
        )

        for n in data.get("awardNominations", []):
            event = n.get("event") or {}
            result.nominations.append(
                Nomination(
                    event_name=event.get("name", "Unknown event"),
                    event_id=event.get("id", ""),
                    year=n.get("year"),
                    award_text=n.get("text", ""),
                    category=n.get("category", ""),
                    is_winner=bool(n.get("isWinner")),
                    nominees=[
                        Nominee(name=p.get("displayName", ""), nm_id=p.get("id"))
                        for p in (n.get("nominees") or [])
                        if p.get("displayName")
                    ],
                )
            )
        if progress:
            progress(len(result.nominations))
        token = data.get("nextPageToken")
        if not token:
            break

    return result


# ------------------------- персоны (nm...) -------------------------

def _format_date(d) -> str:
    """API отдаёт даты объектами {year, month, day} — превращаем в строку."""
    if not d:
        return ""
    if isinstance(d, str):
        return d
    parts = []
    if d.get("day"):
        parts.append(f"{d['day']:02d}")
    if d.get("month"):
        parts.append(f"{d['month']:02d}")
    if d.get("year"):
        parts.append(str(d["year"]))
    return ".".join(parts)


def fetch_person(nm_id: str, progress=None) -> tuple[PersonInfo, list[FilmographyItem]]:
    """Информация о персоне + полная фильмография (постранично).

    При лимите посреди пагинации возвращает частичный список.
    """
    if not re.match(r"^nm\d{4,12}$", nm_id):
        raise ValueError("Некорректный IMDb ID персоны")

    n = _get_json(f"https://api.imdbapi.dev/names/{nm_id}")
    person = PersonInfo(
        nm_id=nm_id,
        name=n.get("displayName", nm_id),
        professions=n.get("primaryProfessions") or [],
        birth_date=_format_date(n.get("birthDate")),
        biography=n.get("biography", ""),
    )

    items: list[FilmographyItem] = []
    seen: set[str] = set()
    token: str | None = None
    for page in range(20):
        if page > 0:
            time.sleep(PAGE_PAUSE)
        url = f"https://api.imdbapi.dev/names/{nm_id}/filmography?pageSize=50"
        if token:
            url += f"&pageToken={urllib.parse.quote(token)}"
        try:
            data = _get_json(url)
        except Exception:
            if items:
                break  # частичная фильмография лучше ошибки
            raise
        for c in data.get("credits", []):
            t = c.get("title") or {}
            if not t.get("id") or not t.get("primaryTitle"):
                continue
            key = f"{t['id']}:{c.get('category', '')}"
            if key in seen:
                continue
            seen.add(key)
            items.append(
                FilmographyItem(
                    title_id=t["id"],
                    title=t["primaryTitle"],
                    year=t.get("startYear"),
                    kind=t.get("type", ""),
                    category=c.get("category", ""),
                    characters=c.get("characters") or [],
                    rating=(t.get("rating") or {}).get("aggregateRating"),
                )
            )
        if progress:
            progress(len(items))
        token = data.get("nextPageToken")
        if not token:
            break

    items.sort(key=lambda x: -(x.year or 0))
    return person, items


# --------------------- события (ev...) через GraphQL ---------------------

_GRAPHQL_URL = "https://api.graphql.imdb.com/"

_EVENT_QUERY = """
query EventEdition($eventId: ID!, $year: Int!) {
  nominationEvent(id: $eventId) {
    id
    name { text }
    editions(limit: 5, filter: { includeYears: [$year] }) {
      year
      awards(limit: 50) {
        text
        nominationCategories(first: 100) {
          edges { node {
            category { text }
            nominations(first: 100) {
              edges { node {
                isWinner
                awardedEntities {
                  ... on AwardedTitles {
                    awardTitles { title { id titleText { text } releaseYear { year } } }
                    secondaryAwardNames { name { id nameText { text } } }
                  }
                  ... on AwardedNames {
                    awardNames { name { id nameText { text } } }
                    secondaryAwardTitles { title { id titleText { text } releaseYear { year } } }
                  }
                }
              } }
            }
          } }
        }
      }
    }
  }
}
"""


def _post_json(url: str, body: dict) -> dict:
    """POST JSON с повторами (как _get_json)."""
    payload = json.dumps(body).encode("utf-8")
    last_error: Exception = RuntimeError("request failed")
    for attempt in range(RETRIES):
        if attempt > 0:
            time.sleep(2.0 * 2 ** (attempt - 1))
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code == 429 or exc.code >= 500:
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
    raise last_error


def _map_ev_titles(items) -> list[tuple[str, str, int | None]]:
    out = []
    for t in items or []:
        title = t.get("title") or {}
        if title.get("id") and (title.get("titleText") or {}).get("text"):
            out.append(
                (
                    title["id"],
                    title["titleText"]["text"],
                    (title.get("releaseYear") or {}).get("year"),
                )
            )
    return out


def _map_ev_names(items) -> list[tuple[str, str]]:
    out = []
    for n in items or []:
        name = n.get("name") or {}
        if name.get("id") and (name.get("nameText") or {}).get("text"):
            out.append((name["id"], name["nameText"]["text"]))
    return out


def fetch_event(event_id: str, year: int) -> EventEdition:
    """Все номинанты церемонии (события) за конкретный год."""
    if not re.match(r"^ev\d{4,12}$", event_id):
        raise ValueError("Некорректный ID события")

    data = _post_json(
        _GRAPHQL_URL,
        {"query": _EVENT_QUERY, "variables": {"eventId": event_id, "year": year}},
    )
    if data.get("errors"):
        raise RuntimeError(data["errors"][0].get("message", "GraphQL error"))

    ev = (data.get("data") or {}).get("nominationEvent")
    if not ev:
        raise LookupError("Событие не найдено на IMDb")
    editions = ev.get("editions") or []
    edition = next((e for e in editions if e.get("year") == year), None) or (
        editions[0] if editions else None
    )
    if not edition:
        raise LookupError(f"Для события нет данных за {year} год")

    result = EventEdition(
        event_id=event_id,
        name=(ev.get("name") or {}).get("text", event_id),
        year=edition.get("year", year),
    )
    for award in edition.get("awards") or []:
        for edge in ((award.get("nominationCategories") or {}).get("edges")) or []:
            node = edge.get("node") or {}
            cat = EventCategory(
                award=award.get("text", ""),
                category=((node.get("category") or {}).get("text"))
                or award.get("text", ""),
            )
            for nom_edge in ((node.get("nominations") or {}).get("edges")) or []:
                n = nom_edge.get("node") or {}
                ents = n.get("awardedEntities") or {}
                titles = _map_ev_titles(ents.get("awardTitles")) + _map_ev_titles(
                    ents.get("secondaryAwardTitles")
                )
                names = _map_ev_names(ents.get("awardNames")) + _map_ev_names(
                    ents.get("secondaryAwardNames")
                )
                if titles or names:
                    cat.nominations.append(
                        EventNomination(
                            is_winner=bool(n.get("isWinner")),
                            titles=titles,
                            names=names,
                        )
                    )
            if cat.nominations:
                cat.nominations.sort(key=lambda x: not x.is_winner)
                result.categories.append(cat)

    if not result.categories:
        raise LookupError(f"Для события нет детальных данных за {year} год")
    return result
