"""Экспорт результатов: Markdown (с Telegram tags), HTML, XLSX (опционально).

XLSX доступен, если установлен пакет openpyxl (см. requirements.txt);
без него кнопка экспорта в Excel сообщит об этом пользователю.
"""

from __future__ import annotations

import html
import re
from collections import OrderedDict

from .imdb_api import Nomination, TitleAwards

# Известные алиасы событий для Telegram-тегов
_TG_EVENT_PREFIXES = [
    (re.compile(r"^Academy_Awards_USA", re.I), "Oscar_"),
    (re.compile(r"^Actor_Awards", re.I), "SAG_"),
]


# --------------------------- группировка ---------------------------

def group_by_event(nominations: list[Nomination]) -> "OrderedDict[str, list[Nomination]]":
    groups: OrderedDict[str, list[Nomination]] = OrderedDict()
    for n in nominations:
        key = f"{n.event_name} {n.year or ''}".strip()
        groups.setdefault(key, []).append(n)
    # события с бОльшим числом побед — первыми
    ordered = sorted(
        groups.items(),
        key=lambda kv: (
            -sum(1 for n in kv[1] if n.is_winner),
            -len(kv[1]),
        ),
    )
    for items in groups.values():
        items.sort(key=lambda n: not n.is_winner)
    return OrderedDict(ordered)


# --------------------------- Telegram tags ---------------------------

def _tg_tag(text: str) -> str:
    text = re.sub(r"['’`]", "", text)
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return "_".join(text.split())


def _tg_person(name: str) -> str:
    name = re.sub(r"['’`]", "", name)
    parts = re.split(r"[^\w]+", name, flags=re.UNICODE)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def _tg_event_tag(event_label: str) -> str:
    tag = _tg_tag(event_label)
    for rx, prefix in _TG_EVENT_PREFIXES:
        if rx.match(tag):
            return prefix + tag
    return tag


# ----------------------------- Markdown -----------------------------

def build_markdown(a: TitleAwards) -> str:
    groups = group_by_event(a.nominations)
    wins = [n for n in a.nominations if n.is_winner]
    L: list[str] = []

    year = f" ({a.year})" if a.year else ""
    L.append(f"# {a.title}{year} — награды IMDb")
    L.append("")
    L.append(
        f"> Источник: [imdb.com/title/{a.imdb_id}/awards]"
        f"(https://www.imdb.com/title/{a.imdb_id}/awards/)  "
    )
    rating = f" · Рейтинг IMDb: **{a.rating}**" if a.rating else ""
    L.append(
        f"> Побед: **{a.win_count}** · Номинаций: **{a.nomination_count}**"
        f" · Событий: **{len(groups)}**{rating}"
    )
    L.append("")

    if wins:
        L.append(f"## 🏆 Победы ({len(wins)})")
        L.append("")
        L.append("| Событие | Год | Награда | Категория | Лауреаты |")
        L.append("|---|---:|---|---|---|")
        for n in wins:
            who = ", ".join(p.name for p in n.nominees)
            url = f"https://www.imdb.com/event/{n.event_id}/{n.year or ''}"
            L.append(
                f"| [{n.event_name}]({url}) | {n.year or ''} | "
                f"{n.award_text} | {n.category} | {who} |"
            )
        L.append("")

    L.append("## Все номинации по событиям")
    L.append("")
    for label, items in groups.items():
        gw = sum(1 for n in items if n.is_winner)
        badge = f" — 🏆 {gw}" if gw else ""
        ev = items[0]
        url = f"https://www.imdb.com/event/{ev.event_id}/{ev.year or ''}"
        L.append(f"### [{label}]({url}){badge}")
        L.append("")
        for n in items:
            who = ", ".join(p.name for p in n.nominees)
            cat = " · ".join(x for x in (n.award_text, n.category) if x)
            if n.is_winner:
                suffix = f" — **{who}**" if who else ""
                L.append(f"- 🏆 **{cat}**{suffix} — ПОБЕДА")
            else:
                suffix = f" — {who}" if who else ""
                L.append(f"- {cat}{suffix}")
        L.append("")

    L.append("---")
    L.append("_Отчёт сформирован автоматически по данным IMDb._")
    L.append("")

    # ------- Telegram tags -------
    L.append("##Telegram tags")
    L.append("")
    L.append("▌ **Tags**")
    seen: set[str] = set()
    for label, items in groups.items():
        tag = _tg_event_tag(label)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        has_win = any(n.is_winner for n in items)
        L.append(f"{'🔸' if has_win else '🔹'} #{tag}")
    L.append("")

    persons: list[str] = []
    seen_p: set[str] = set()
    for name in a.directors + a.stars:
        tag = _tg_person(name)
        if tag and tag not in seen_p:
            seen_p.add(tag)
            persons.append(f"#{tag}")
    if persons:
        L.append("▌ **Persons**")
        L.append(" ".join(persons))
        L.append("")

    L.append(f"▌ **Name**: {a.title}")
    L.append("")
    if a.year:
        L.append(f"▌ **Year**: {a.year}")
        L.append("")
    if a.plot:
        L.append("▌ **Storiline**")
        L.append(a.plot)
        L.append("")

    cast_lines: list[str] = []
    if a.directors:
        word = "Directors" if len(a.directors) > 1 else "Director"
        cast_lines.append(f"**{word}**: {', '.join(a.directors)}")
    if a.writers:
        word = "Writers" if len(a.writers) > 1 else "Writer"
        cast_lines.append(f"**{word}**: {', '.join(a.writers)}")
    if a.stars:
        cast_lines.append(f"**Stars**: {', '.join(a.stars)}")
    if cast_lines:
        L.append("▌ **Cast**")
        L.extend(cast_lines)
        L.append("")

    return "\n".join(L)


# ------------------------------- HTML -------------------------------

_CSS = """
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0b1120;color:#e2e8f0;
padding:32px 16px;max-width:920px;margin:0 auto}
h1{color:#fff}h1 .a{color:#fbbf24}
.sub{color:#64748b;font-size:13px}.sub a{color:#94a3b8}
.stats{display:flex;gap:10px;margin:18px 0}
.stat{background:#ffffff0d;border:1px solid #ffffff1a;border-radius:12px;
padding:10px 18px;text-align:center}
.stat b{display:block;font-size:22px;color:#fbbf24}
.stat span{font-size:11px;color:#64748b;text-transform:uppercase}
section{background:#ffffff0a;border:1px solid #ffffff17;border-radius:14px;
margin:14px 0;overflow:hidden}
section>h2{font-size:15px;color:#fbbf24;padding:10px 16px;margin:0;
background:linear-gradient(90deg,#f59e0b26,transparent)}
.row{padding:9px 16px;border-top:1px solid #ffffff0a}
.row.win{background:#f59e0b1a;color:#fde68a;font-weight:600}
.who{color:#94a3b8;font-weight:400;font-size:13px}
.badge{background:#f59e0b33;color:#fbbf24;border-radius:999px;
font-size:10px;font-weight:700;padding:2px 8px;margin-left:8px}
"""


def build_html(a: TitleAwards) -> str:
    groups = group_by_event(a.nominations)
    e = html.escape
    year = f" ({a.year})" if a.year else ""
    parts = [
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>",
        f"<title>{e(a.title)}{year} — награды IMDb</title>",
        f"<style>{_CSS}</style></head><body>",
        f"<h1><span class='a'>{e(a.title)}</span>{year} — награды IMDb</h1>",
        f"<div class='sub'>Источник: <a href='https://www.imdb.com/title/{a.imdb_id}/awards/'>"
        f"imdb.com/title/{a.imdb_id}/awards</a></div>",
        "<div class='stats'>"
        f"<div class='stat'><b>{a.win_count}</b><span>побед</span></div>"
        f"<div class='stat'><b>{a.nomination_count}</b><span>номинаций</span></div>"
        f"<div class='stat'><b>{len(groups)}</b><span>событий</span></div></div>",
    ]
    if a.plot:
        parts.append(f"<section><div class='row who'>{e(a.plot)}</div></section>")
    for label, items in groups.items():
        gw = sum(1 for n in items if n.is_winner)
        badge = f"<span class='badge'>🏆 {gw}</span>" if gw else ""
        parts.append(f"<section><h2>{e(label)}{badge}</h2>")
        for n in items:
            cat = " · ".join(x for x in (n.award_text, n.category) if x)
            who = ", ".join(p.name for p in n.nominees)
            cls = "row win" if n.is_winner else "row"
            mark = "🏆 " if n.is_winner else ""
            who_html = f" <span class='who'>— {e(who)}</span>" if who else ""
            parts.append(f"<div class='{cls}'>{mark}{e(cat)}{who_html}</div>")
        parts.append("</section>")
    parts.append("</body></html>")
    return "".join(parts)


# ------------------------------- XLSX -------------------------------

def build_xlsx(a: TitleAwards, path: str) -> None:
    """Сохранение в Excel. Требует openpyxl."""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Для экспорта в XLSX установите пакет:  pip install openpyxl"
        ) from exc

    wb = Workbook()
    header_fill = PatternFill("solid", fgColor="1E293B")
    header_font = Font(bold=True, color="FFFFFF")
    win_fill = PatternFill("solid", fgColor="FEF3C7")
    win_font = Font(bold=True, color="92400E")

    def style_sheet(ws, headers: list[str], rows: list[tuple], win_flags: list[bool]):
        ws.append(headers)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(vertical="center", wrap_text=True)
        for row, is_win in zip(rows, win_flags):
            ws.append(row)
            if is_win:
                for cell in ws[ws.max_row]:
                    cell.fill = win_fill
                    cell.font = win_font
        # автоширина + перенос строк
        for col_idx in range(1, len(headers) + 1):
            letter = get_column_letter(col_idx)
            width = 0
            for cell in ws[letter]:
                for line in str(cell.value or "").split("\n"):
                    width = max(width, len(line))
                cell.alignment = Alignment(vertical="top", wrap_text=True)
            ws.column_dimensions[letter].width = min(max(width + 3, 8), 55)
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}1"

    # Лист 1: победы
    ws1 = wb.active
    ws1.title = "Победы"
    wins = [n for n in a.nominations if n.is_winner]
    style_sheet(
        ws1,
        ["Событие", "Год", "Награда", "Категория", "Лауреаты"],
        [
            (
                n.event_name,
                n.year or "",
                n.award_text,
                n.category,
                ", ".join(p.name for p in n.nominees),
            )
            for n in wins
        ],
        [True] * len(wins),
    )

    # Лист 2: все номинации
    ws2 = wb.create_sheet("Все номинации")
    groups = group_by_event(a.nominations)
    all_rows: list[tuple] = []
    all_flags: list[bool] = []
    for label, items in groups.items():
        for n in items:
            all_rows.append(
                (
                    n.event_name,
                    n.year or "",
                    n.award_text,
                    n.category,
                    "🏆 Победа" if n.is_winner else "Номинация",
                    ", ".join(p.name for p in n.nominees),
                )
            )
            all_flags.append(n.is_winner)
    style_sheet(
        ws2,
        ["Событие", "Год", "Награда", "Категория", "Статус", "Номинанты"],
        all_rows,
        all_flags,
    )

    wb.save(path)


# ====================================================================
#                     Кинопоиск: отчёт о премии
# ====================================================================

from .kinopoisk_api import FilmMatch, Report  # noqa: E402


def kp_report_markdown(r: Report) -> str:
    total = sum(len(c.entries) for c in r.categories)
    wins = sum(1 for c in r.categories for e in c.entries if e.winner)
    L: list[str] = []
    L.append(f"# {r.award_name} {r.year}")
    L.append("")
    L.append(f"> Источник: [{r.source_url}]({r.source_url})  ")
    L.append(
        f"> Категорий: **{len(r.categories)}** · Номинаций: **{total}**"
        f" · Наград вручено: **{wins}**"
    )
    L.append("")
    L.append("## 🏆 Победители — кратко")
    L.append("")
    L.append("| Категория | Победитель | Фильм |")
    L.append("|---|---|---|")
    for c in r.categories:
        for e in c.entries:
            if not e.winner:
                continue
            who = ", ".join(t for t, _ in e.people) or e.ru
            films = ", ".join(t for t, _ in e.films) or "—"
            L.append(f"| {c.name} | {who} | {films} |")
    L.append("")
    L.append("## Подробно по категориям")
    L.append("")
    for c in r.categories:
        L.append(f"### {c.name}")
        L.append("")
        for e in sorted(c.entries, key=lambda x: not x.winner):
            en = f" _({e.en})_" if e.en else ""
            if e.winner:
                L.append(f"- 🏆 **{e.ru}**{en}")
            else:
                L.append(f"- {e.ru}{en}")
        L.append("")
    L.append("---")
    L.append("_Отчёт сформирован автоматически по данным Кинопоиска._")
    L.append("")

    # Telegram tags
    L.append("##Telegram tags")
    L.append("")
    L.append("▌ **Tags**")
    L.append(f"🔸 #{_tg_tag(f'{r.award_name} {r.year}')}")
    seen: set[str] = set()
    for c in r.categories:
        for e in c.entries:
            if not e.winner:
                continue
            for t, _ in e.films:
                tag = _tg_tag(t)
                if tag and tag not in seen:
                    seen.add(tag)
                    L.append(f"🔹 #{tag}")
    L.append("")
    persons: list[str] = []
    seen_p: set[str] = set()
    for c in r.categories:
        for e in c.entries:
            if not e.winner:
                continue
            for t, _ in e.people:
                tag = _tg_person(t)
                if tag and tag not in seen_p:
                    seen_p.add(tag)
                    persons.append(f"#{tag}")
    if persons:
        L.append("▌ **Persons**")
        L.append(" ".join(persons))
        L.append("")
    L.append(f"▌ **Name**: {r.award_name}")
    L.append("")
    L.append(f"▌ **Year**: {r.year}")
    L.append("")
    return "\n".join(L)


def kp_report_html(r: Report) -> str:
    e = html.escape
    total = sum(len(c.entries) for c in r.categories)
    wins = sum(1 for c in r.categories for x in c.entries if x.winner)
    parts = [
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>",
        f"<title>{e(r.award_name)} {r.year} — отчёт</title>",
        f"<style>{_CSS}</style></head><body>",
        f"<h1><span class='a'>{e(r.award_name)}</span> {r.year}</h1>",
        f"<div class='sub'>Источник: <a href='{e(r.source_url)}'>{e(r.source_url)}</a></div>",
        "<div class='stats'>"
        f"<div class='stat'><b>{len(r.categories)}</b><span>категорий</span></div>"
        f"<div class='stat'><b>{total}</b><span>номинаций</span></div>"
        f"<div class='stat'><b>{wins}</b><span>наград</span></div></div>",
    ]
    for c in r.categories:
        parts.append(f"<section><h2>{e(c.name)}</h2>")
        for x in sorted(c.entries, key=lambda v: not v.winner):
            cls = "row win" if x.winner else "row"
            mark = "🏆 " if x.winner else ""
            en = f" <span class='who'>· {e(x.en)}</span>" if x.en else ""
            parts.append(f"<div class='{cls}'>{mark}{e(x.ru)}{en}</div>")
        parts.append("</section>")
    parts.append("</body></html>")
    return "".join(parts)


def _xlsx_style_sheet(ws, headers, rows, win_flags):
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    header_fill = PatternFill("solid", fgColor="1E293B")
    header_font = Font(bold=True, color="FFFFFF")
    win_fill = PatternFill("solid", fgColor="FEF3C7")
    win_font = Font(bold=True, color="92400E")

    ws.append(headers)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row, is_win in zip(rows, win_flags):
        ws.append(row)
        if is_win:
            for cell in ws[ws.max_row]:
                cell.fill = win_fill
                cell.font = win_font
    for col_idx in range(1, len(headers) + 1):
        letter = get_column_letter(col_idx)
        width = 0
        for cell in ws[letter]:
            for line in str(cell.value or "").split("\n"):
                width = max(width, len(line))
            cell.alignment = Alignment(vertical="top", wrap_text=True)
        ws.column_dimensions[letter].width = min(max(width + 3, 8), 55)
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}1"


def kp_report_xlsx(r: Report, path: str) -> None:
    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise RuntimeError(
            "Для экспорта в XLSX установите пакет:  pip install openpyxl"
        ) from exc

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Победители"
    rows1, flags1 = [], []
    for c in r.categories:
        for x in c.entries:
            if x.winner:
                rows1.append(
                    (
                        c.name,
                        ", ".join(t for t, _ in x.people) or x.ru,
                        x.en,
                        ", ".join(t for t, _ in x.films) or "—",
                    )
                )
                flags1.append(True)
    _xlsx_style_sheet(ws1, ["Категория", "Победитель", "Оригинал", "Фильм"], rows1, flags1)

    ws2 = wb.create_sheet("Все номинации")
    rows2, flags2 = [], []
    for c in r.categories:
        for x in sorted(c.entries, key=lambda v: not v.winner):
            rows2.append(
                (
                    c.name,
                    "🏆 Победитель" if x.winner else "Номинант",
                    ", ".join(t for t, _ in x.people) or x.ru,
                    x.en,
                    ", ".join(t for t, _ in x.films) or "—",
                )
            )
            flags2.append(x.winner)
    _xlsx_style_sheet(
        ws2, ["Категория", "Статус", "Номинант", "Оригинал", "Фильм"], rows2, flags2
    )
    wb.save(path)


# ====================================================================
#                Кинопоиск: результаты поиска фильма
# ====================================================================

def kp_film_markdown(query: str, film_year: int, matches: list[FilmMatch]) -> str:
    wins = [m for m in matches if m.entry.winner]
    groups: dict[str, list[FilmMatch]] = {}
    for m in matches:
        groups.setdefault(f"{m.award_name} {m.year}", []).append(m)

    L: list[str] = []
    L.append(f"# «{query}» ({film_year}) — награды и номинации")
    L.append("")
    L.append(f"> Премии Кинопоиска за {film_year}–{film_year + 2} годы  ")
    L.append(
        f"> Побед: **{len(wins)}** · Номинаций: **{len(matches)}**"
        f" · Премий: **{len(groups)}**"
    )
    L.append("")
    if wins:
        L.append("## 🏆 Победы")
        L.append("")
        L.append("| Премия | Год | Категория | Лауреат |")
        L.append("|---|---:|---|---|")
        for m in wins:
            who = ", ".join(t for t, _ in m.entry.people) or query
            L.append(
                f"| [{m.award_name}]({m.source_url}) | {m.year} | {m.category} | {who} |"
            )
        L.append("")
    L.append("## Все номинации по премиям")
    L.append("")
    for label, items in groups.items():
        gw = sum(1 for m in items if m.entry.winner)
        badge = f" — 🏆 {gw}" if gw else ""
        L.append(f"### [{label}]({items[0].source_url}){badge}")
        L.append("")
        for m in sorted(items, key=lambda x: not x.entry.winner):
            en = f" _({m.entry.en})_" if m.entry.en else ""
            if m.entry.winner:
                L.append(f"- 🏆 **{m.category}** — **{m.entry.ru}**{en} — ПОБЕДА")
            else:
                L.append(f"- {m.category} — {m.entry.ru}{en}")
        L.append("")
    L.append("---")
    L.append("_Отчёт сформирован автоматически по данным Кинопоиска._")
    L.append("")

    # Telegram tags
    L.append("##Telegram tags")
    L.append("")
    L.append("▌ **Tags**")
    seen: set[str] = set()
    for label, items in groups.items():
        tag = _tg_tag(label)
        if not tag or tag in seen:
            continue
        seen.add(tag)
        has_win = any(m.entry.winner for m in items)
        L.append(f"{'🔸' if has_win else '🔹'} #{tag}")
    L.append("")
    persons: list[str] = []
    seen_p: set[str] = set()
    ordered = wins + [m for m in matches if not m.entry.winner]
    for m in ordered:
        for t, _ in m.entry.people:
            tag = _tg_person(t)
            if tag and tag not in seen_p:
                seen_p.add(tag)
                persons.append(f"#{tag}")
    if persons:
        L.append("▌ **Persons**")
        L.append(" ".join(persons))
        L.append("")
    L.append(f"▌ **Name**: {query}")
    L.append("")
    L.append(f"▌ **Year**: {film_year}")
    L.append("")
    return "\n".join(L)


def kp_film_html(query: str, film_year: int, matches: list[FilmMatch]) -> str:
    e = html.escape
    wins = [m for m in matches if m.entry.winner]
    groups: dict[str, list[FilmMatch]] = {}
    for m in matches:
        groups.setdefault(f"{m.award_name} {m.year}", []).append(m)
    parts = [
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>",
        f"<title>«{e(query)}» ({film_year}) — награды</title>",
        f"<style>{_CSS}</style></head><body>",
        f"<h1>🎞️ <span class='a'>«{e(query)}»</span> ({film_year}) — награды</h1>",
        "<div class='stats'>"
        f"<div class='stat'><b>{len(wins)}</b><span>побед</span></div>"
        f"<div class='stat'><b>{len(matches)}</b><span>номинаций</span></div>"
        f"<div class='stat'><b>{len(groups)}</b><span>премий</span></div></div>",
    ]
    for label, items in groups.items():
        gw = sum(1 for m in items if m.entry.winner)
        badge = f"<span class='badge'>🏆 {gw}</span>" if gw else ""
        parts.append(f"<section><h2>{e(label)}{badge}</h2>")
        for m in sorted(items, key=lambda x: not x.entry.winner):
            cls = "row win" if m.entry.winner else "row"
            mark = "🏆 " if m.entry.winner else ""
            parts.append(
                f"<div class='{cls}'>{mark}{e(m.category)}"
                f" <span class='who'>— {e(m.entry.ru)}</span></div>"
            )
        parts.append("</section>")
    parts.append("</body></html>")
    return "".join(parts)


def kp_film_xlsx(query: str, film_year: int, matches: list[FilmMatch], path: str) -> None:
    try:
        from openpyxl import Workbook
    except ImportError as exc:
        raise RuntimeError(
            "Для экспорта в XLSX установите пакет:  pip install openpyxl"
        ) from exc

    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Победы"
    wins = [m for m in matches if m.entry.winner]
    _xlsx_style_sheet(
        ws1,
        ["Премия", "Год", "Категория", "Лауреат"],
        [
            (
                m.award_name,
                m.year,
                m.category,
                ", ".join(t for t, _ in m.entry.people) or query,
            )
            for m in wins
        ],
        [True] * len(wins),
    )
    ws2 = wb.create_sheet("Все номинации")
    rows, flags = [], []
    for m in matches:
        rows.append(
            (
                m.award_name,
                m.year,
                m.category,
                "🏆 Победа" if m.entry.winner else "Номинация",
                m.entry.ru,
                m.entry.en,
            )
        )
        flags.append(m.entry.winner)
    _xlsx_style_sheet(
        ws2,
        ["Премия", "Год", "Категория", "Статус", "Номинант", "Оригинал"],
        rows,
        flags,
    )
    wb.save(path)
