"""Модуль TMDB: поиск фильмов/сериалов (в т.ч. по-русски) и резолв в IMDb ID.

TMDB не хранит награды, поэтому выбор в TMDB ведёт к модулю IMDb.
Ключ (v3 API Key или v4 Read Access Token) хранится в settings.json
рядом с проектом.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

SETTINGS_PATH = Path(__file__).resolve().parent.parent / "settings.json"
TIMEOUT = 20


@dataclass
class TmdbResult:
    tmdb_id: int
    media_type: str  # movie | tv
    title: str
    original_title: str
    year: int | None
    rating: float | None
    overview: str


# ----------------------------- настройки -----------------------------

def load_key() -> str:
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return str(data.get("tmdb_api_key", "")).strip()
    except (OSError, ValueError):
        return ""


def save_key(key: str) -> None:
    data: dict = {}
    if SETTINGS_PATH.exists():
        try:
            data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
    data["tmdb_api_key"] = key.strip()
    SETTINGS_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def delete_key() -> None:
    save_key("")


# ------------------------------- HTTP -------------------------------

def _get(path: str, params: dict[str, str]) -> dict:
    key = load_key()
    if not key:
        raise PermissionError("TMDB_KEY_MISSING")
    is_v4 = key.startswith("ey")
    if not is_v4:
        params = {**params, "api_key": key}
    url = f"https://api.themoviedb.org/3{path}?{urllib.parse.urlencode(params)}"
    headers = {"Accept": "application/json"}
    if is_v4:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise PermissionError("TMDB_KEY_INVALID") from exc
        raise


def validate_key(candidate: str) -> bool:
    """Проверка ключа живым запросом к TMDB."""
    candidate = candidate.strip()
    if len(candidate) < 10:
        return False
    is_v4 = candidate.startswith("ey")
    url = "https://api.themoviedb.org/3/configuration"
    headers = {"Accept": "application/json"}
    if is_v4:
        headers["Authorization"] = f"Bearer {candidate}"
    else:
        url += f"?api_key={urllib.parse.quote(candidate)}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT):
            return True
    except Exception:
        return False


# ------------------------------ функции ------------------------------

def search(query: str) -> list[TmdbResult]:
    data = _get(
        "/search/multi",
        {"query": query, "language": "ru-RU", "include_adult": "false", "page": "1"},
    )
    out: list[TmdbResult] = []
    for r in data.get("results", []):
        if r.get("media_type") not in ("movie", "tv"):
            continue
        date = r.get("release_date") or r.get("first_air_date") or ""
        out.append(
            TmdbResult(
                tmdb_id=r["id"],
                media_type=r["media_type"],
                title=(r.get("title") or r.get("name") or "").strip(),
                original_title=r.get("original_title") or r.get("original_name") or "",
                year=int(date[:4]) if date[:4].isdigit() else None,
                rating=r.get("vote_average"),
                overview=r.get("overview") or "",
            )
        )
    return out[:12]


def resolve_imdb_id(tmdb_id: int, media_type: str) -> str | None:
    data = _get(f"/{media_type}/{tmdb_id}/external_ids", {})
    imdb_id = data.get("imdb_id")
    if imdb_id and imdb_id.startswith("tt"):
        return imdb_id
    return None
