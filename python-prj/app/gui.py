"""Главное окно приложения: вкладки IMDb / Кинопоиск / TMDB.

Вкладка IMDb: поиск → награды фильма → экспорт; двойной клик по событию
открывает всех номинантов церемонии, по номинации — окно персоны.
"""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import exporters, imdb_api
from .gui_kp import KpFilmTab, KpReportTab
from .gui_tmdb import TmdbTab

BG = "#0f172a"
FG = "#e2e8f0"
ACCENT = "#fbbf24"
MUTED = "#64748b"


def run_bg(fn, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


class AwardsApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Кинонаграды — IMDb · Кинопоиск · TMDB")
        self.geometry("1080x740")
        self.minsize(860, 580)
        self.configure(bg=BG)
        self._build_styles()

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=8, pady=8)

        self.imdb_tab = ImdbTab(self.notebook, self)
        self.kp_report_tab = KpReportTab(self.notebook, self)
        self.kp_film_tab = KpFilmTab(self.notebook, self)
        self.tmdb_tab = TmdbTab(self.notebook, self)

        self.notebook.add(self.imdb_tab, text="  IMDb: награды фильма  ")
        self.notebook.add(self.kp_report_tab, text="  Кинопоиск: отчёт о премии  ")
        self.notebook.add(self.kp_film_tab, text="  Кинопоиск: поиск фильма  ")
        self.notebook.add(self.tmdb_tab, text="  TMDB  ")

    def _build_styles(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TFrame", background=BG)
        style.configure("TNotebook", background=BG, borderwidth=0)
        style.configure("TNotebook.Tab", padding=(10, 6))
        style.configure("TLabel", background=BG, foreground=FG)
        style.configure("Muted.TLabel", background=BG, foreground=MUTED, font=("Segoe UI", 9))
        style.configure(
            "Header.TLabel", background=BG, foreground=ACCENT, font=("Segoe UI", 14, "bold")
        )
        style.configure("TButton", padding=6)
        style.configure(
            "Treeview", background="#1e293b", fieldbackground="#1e293b",
            foreground=FG, rowheight=24,
        )
        style.configure("Treeview.Heading", background="#334155", foreground="#ffffff")
        style.configure(
            "Horizontal.TProgressbar", troughcolor="#1e293b", background=ACCENT
        )

    # Публичный переход: открыть награды фильма на вкладке IMDb
    def open_imdb_title(self, imdb_id: str, title: str = "") -> None:
        self.notebook.select(self.imdb_tab)
        self.imdb_tab.load_title(imdb_id, title)


# ======================= вкладка IMDb =======================

class ImdbTab(ttk.Frame):
    def __init__(self, parent, app: AwardsApp) -> None:
        super().__init__(parent, padding=10)
        self.app = app
        self._results: list[imdb_api.SearchResult] = []
        self._awards: imdb_api.TitleAwards | None = None
        self._groups: list[tuple[str, list[imdb_api.Nomination]]] = []
        self._build()

    def _build(self) -> None:
        ttk.Label(self, text="🏆 Награды фильма по данным IMDb", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            self,
            text="Поиск → двойной клик по фильму → награды. Двойной клик по событию — "
            "все номинанты церемонии 🎪, по номинации — окно персоны ⭐.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        row = ttk.Frame(self)
        row.pack(fill="x")
        self.query_var = tk.StringVar()
        entry = ttk.Entry(row, textvariable=self.query_var, font=("Segoe UI", 12))
        entry.pack(side="left", fill="x", expand=True, ipady=4)
        entry.bind("<Return>", lambda _e: self.on_search())
        ttk.Button(row, text="Найти", command=self.on_search).pack(side="left", padx=(8, 0))

        self.results_tree = ttk.Treeview(
            self, columns=("year", "kind", "actors"), height=5, show="tree headings"
        )
        for col, text, w in (
            ("#0", "Название", 320), ("year", "Год", 60),
            ("kind", "Тип", 90), ("actors", "В ролях", 330),
        ):
            self.results_tree.heading(col, text=text)
            self.results_tree.column(col, width=w, anchor="center" if col == "year" else "w")
        self.results_tree.pack(fill="x", pady=(8, 0))
        self.results_tree.bind("<Double-1>", lambda _e: self.on_pick())

        self.status_var = tk.StringVar(value="Готово к поиску.")
        ttk.Label(self, textvariable=self.status_var, style="Muted.TLabel").pack(anchor="w", pady=(6, 0))
        self.stats_var = tk.StringVar(value="")
        ttk.Label(
            self, textvariable=self.stats_var, background=BG,
            foreground=ACCENT, font=("Segoe UI", 11, "bold"),
        ).pack(anchor="w")

        self.awards_tree = ttk.Treeview(self, columns=("who",), show="tree headings")
        self.awards_tree.heading("#0", text="Событие / категория (двойной клик — детали)")
        self.awards_tree.heading("who", text="Номинанты")
        self.awards_tree.column("#0", width=480)
        self.awards_tree.column("who", width=380)
        self.awards_tree.tag_configure("win", background="#493b12", foreground="#fde68a")
        self.awards_tree.tag_configure("event", font=("Segoe UI", 10, "bold"))
        self.awards_tree.pack(fill="both", expand=True, pady=(6, 0))
        self.awards_tree.bind("<Double-1>", self.on_tree_double)

        btns = ttk.Frame(self)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="💾 Markdown", command=self.on_export_md).pack(side="left")
        ttk.Button(btns, text="💾 HTML", command=self.on_export_html).pack(side="left", padx=8)
        ttk.Button(btns, text="💾 XLSX", command=self.on_export_xlsx).pack(side="left")
        ttk.Button(btns, text="🎪 Номинанты события", command=self.on_open_event).pack(side="left", padx=(24, 0))
        ttk.Button(btns, text="⭐ Персона из номинации", command=self.on_open_person).pack(side="left", padx=8)

    # ---------- поиск и загрузка ----------

    def on_search(self) -> None:
        query = self.query_var.get().strip()
        if len(query) < 2:
            messagebox.showinfo("Поиск", "Введите минимум 2 символа названия.")
            return
        self.status_var.set(f"Ищем «{query}»…")
        run_bg(self._do_search, query)

    def _do_search(self, query: str) -> None:
        try:
            results = imdb_api.search_titles(query)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self._fail(f"Ошибка поиска: {exc}"))
            return
        self.after(0, lambda: self._show_results(results))

    def _show_results(self, results) -> None:
        self._results = results
        self.results_tree.delete(*self.results_tree.get_children())
        for i, r in enumerate(results):
            self.results_tree.insert(
                "", "end", iid=str(i), text=r.title,
                values=(r.year or "", r.kind, r.actors),
            )
        self.status_var.set(
            f"Найдено: {len(results)}. Двойной клик — загрузить награды."
            if results else "Ничего не найдено."
        )

    def on_pick(self) -> None:
        sel = self.results_tree.selection()
        if not sel:
            return
        r = self._results[int(sel[0])]
        self.load_title(r.imdb_id, r.title)

    def load_title(self, imdb_id: str, title: str = "") -> None:
        self.status_var.set(f"Загружаем награды {title or imdb_id}…")
        run_bg(self._do_fetch, imdb_id)

    def _do_fetch(self, imdb_id: str) -> None:
        def progress(count: int) -> None:
            self.after(0, lambda: self.status_var.set(f"Загружено номинаций: {count}…"))

        try:
            awards = imdb_api.fetch_awards(imdb_id, progress=progress)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self._fail(f"Ошибка загрузки: {exc}"))
            return
        self.after(0, lambda: self._show_awards(awards))

    def _show_awards(self, a: imdb_api.TitleAwards) -> None:
        self._awards = a
        self.awards_tree.delete(*self.awards_tree.get_children())
        groups = exporters.group_by_event(a.nominations)
        self._groups = list(groups.items())
        for gi, (label, items) in enumerate(self._groups):
            gw = sum(1 for n in items if n.is_winner)
            badge = f"  🏆 {gw}" if gw else ""
            parent = self.awards_tree.insert(
                "", "end", iid=f"g{gi}", text=f"🎪 {label}{badge}",
                open=(gw > 0), tags=("event",),
            )
            for ni, n in enumerate(items):
                cat = " · ".join(x for x in (n.award_text, n.category) if x)
                who = ", ".join(p.name for p in n.nominees)
                mark = "🏆 " if n.is_winner else "· "
                self.awards_tree.insert(
                    parent, "end", iid=f"g{gi}n{ni}", text=f"{mark}{cat}",
                    values=(who,), tags=("win",) if n.is_winner else (),
                )
        year = f" ({a.year})" if a.year else ""
        self.stats_var.set(
            f"{a.title}{year}: 🏆 {a.win_count} побед · {a.nomination_count} номинаций"
            f" · {len(self._groups)} событий"
        )
        self.status_var.set("Готово. Экспорт и детали — кнопки ниже.")

    # ---------- детали: событие и персона ----------

    def _selected_ids(self) -> tuple[int | None, int | None]:
        sel = self.awards_tree.selection()
        if not sel:
            return None, None
        iid = sel[0]
        if "n" in iid:
            g, n = iid[1:].split("n")
            return int(g), int(n)
        return int(iid[1:]), None

    def on_tree_double(self, _event) -> None:
        gi, ni = self._selected_ids()
        if gi is None:
            return
        if ni is None:
            self.on_open_event()
        else:
            self.on_open_person()

    def on_open_event(self) -> None:
        gi, _ = self._selected_ids()
        if gi is None or not self._groups:
            messagebox.showinfo("Событие", "Выберите событие в списке наград.")
            return
        _label, items = self._groups[gi]
        n = items[0]
        if not n.event_id or not n.year:
            messagebox.showinfo("Событие", "У события нет ID/года на IMDb.")
            return
        EventWindow(self.app, n.event_id, n.year, n.event_name)

    def on_open_person(self) -> None:
        gi, ni = self._selected_ids()
        if gi is None or ni is None:
            messagebox.showinfo("Персона", "Выберите номинацию (строку внутри события).")
            return
        n = self._groups[gi][1][ni]
        candidates = [p for p in n.nominees if p.nm_id]
        if not candidates:
            messagebox.showinfo("Персона", "В этой номинации нет персон с профилем IMDb.")
            return
        if len(candidates) == 1:
            PersonWindow(self.app, candidates[0].nm_id, candidates[0].name)
            return
        # выбор из нескольких
        win = tk.Toplevel(self.app)
        win.title("Выберите персону")
        win.configure(bg=BG)
        lb = tk.Listbox(win, width=48, height=min(12, len(candidates)),
                        bg="#1e293b", fg=FG, font=("Segoe UI", 11))
        for p in candidates:
            lb.insert("end", p.name)
        lb.pack(padx=12, pady=12)

        def choose(_e=None):
            sel = lb.curselection()
            if sel:
                p = candidates[sel[0]]
                win.destroy()
                PersonWindow(self.app, p.nm_id, p.name)

        lb.bind("<Double-1>", choose)
        ttk.Button(win, text="Открыть", command=choose).pack(pady=(0, 12))

    # ---------- экспорт ----------

    def _need_awards(self):
        if not self._awards:
            messagebox.showinfo("Экспорт", "Сначала загрузите награды фильма.")
            return None
        return self._awards

    def _default_name(self, ext: str) -> str:
        a = self._awards
        safe = "".join(c for c in a.title if c.isalnum() or c in " -_").strip()
        return f"{safe or 'awards'}-{a.year or ''}-awards.{ext}"

    def _save(self, ext: str, filetypes, build) -> None:
        a = self._need_awards()
        if not a:
            return
        path = filedialog.asksaveasfilename(
            defaultextension=f".{ext}", initialfile=self._default_name(ext),
            filetypes=filetypes,
        )
        if not path:
            return
        try:
            build(a, path)
        except RuntimeError as exc:
            messagebox.showwarning("Экспорт", str(exc))
            return
        self.status_var.set(f"Сохранено: {path}")

    def on_export_md(self) -> None:
        self._save("md", [("Markdown", "*.md")],
                   lambda a, p: Path(p).write_text(exporters.build_markdown(a), encoding="utf-8"))

    def on_export_html(self) -> None:
        self._save("html", [("HTML", "*.html")],
                   lambda a, p: Path(p).write_text(exporters.build_html(a), encoding="utf-8"))

    def on_export_xlsx(self) -> None:
        self._save("xlsx", [("Excel", "*.xlsx")], lambda a, p: exporters.build_xlsx(a, p))

    def _fail(self, message: str) -> None:
        self.status_var.set(message)
        messagebox.showerror("Ошибка", message)


from pathlib import Path  # noqa: E402


# ======================= окно персоны =======================

class PersonWindow(tk.Toplevel):
    def __init__(self, app: AwardsApp, nm_id: str, name: str = "") -> None:
        super().__init__(app)
        self.app = app
        self.nm_id = nm_id
        self.title(f"⭐ {name or nm_id} — фильмография")
        self.geometry("860x560")
        self.configure(bg=BG)

        self.info_var = tk.StringVar(value=f"Загружаем данные {name or nm_id}…")
        ttk.Label(self, textvariable=self.info_var, style="Header.TLabel").pack(anchor="w", padx=12, pady=(12, 2))
        self.sub_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.sub_var, style="Muted.TLabel", wraplength=820).pack(anchor="w", padx=12)

        self.tree = ttk.Treeview(self, columns=("year", "cat", "role", "rating"), show="tree headings")
        for col, text, w in (
            ("#0", "Фильм (двойной клик — награды)", 360), ("year", "Год", 60),
            ("cat", "Роль в проекте", 110), ("role", "Персонаж", 180), ("rating", "★", 50),
        ):
            self.tree.heading(col, text=text)
            self.tree.column(col, width=w, anchor="center" if col in ("year", "rating") else "w")
        self.tree.pack(fill="both", expand=True, padx=12, pady=(8, 12))
        self.tree.bind("<Double-1>", self._on_open_film)

        self._items: list[imdb_api.FilmographyItem] = []
        run_bg(self._load)

    def _load(self) -> None:
        def progress(count: int) -> None:
            self.after(0, lambda: self.sub_var.set(f"Загружено работ: {count}…"))

        try:
            person, items = imdb_api.fetch_person(self.nm_id, progress=progress)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.sub_var.set(f"Ошибка: {exc}"))
            return
        self.after(0, lambda: self._show(person, items))

    def _show(self, person: imdb_api.PersonInfo, items) -> None:
        self._items = items
        self.info_var.set(f"⭐ {person.name}")
        extra = " · ".join(
            x for x in (
                ", ".join(person.professions[:3]),
                f"род. {person.birth_date}" if person.birth_date else "",
                f"{len(items)} работ",
            ) if x
        )
        self.sub_var.set(extra)
        self.tree.delete(*self.tree.get_children())
        for i, f in enumerate(items):
            self.tree.insert(
                "", "end", iid=str(i), text=f.title,
                values=(f.year or "", f.category, ", ".join(f.characters[:2]),
                        f.rating or ""),
            )

    def _on_open_film(self, _e) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        f = self._items[int(sel[0])]
        self.app.open_imdb_title(f.title_id, f.title)


# ======================= окно события =======================

class EventWindow(tk.Toplevel):
    def __init__(self, app: AwardsApp, event_id: str, year: int, name: str = "") -> None:
        super().__init__(app)
        self.app = app
        self.title(f"🎪 {name or event_id} {year} — все номинанты")
        self.geometry("900x600")
        self.configure(bg=BG)

        self.info_var = tk.StringVar(value=f"Загружаем номинантов {name} {year}…")
        ttk.Label(self, textvariable=self.info_var, style="Header.TLabel").pack(anchor="w", padx=12, pady=(12, 2))
        self.sub_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.sub_var, style="Muted.TLabel").pack(anchor="w", padx=12)

        self.tree = ttk.Treeview(self, columns=("who",), show="tree headings")
        self.tree.heading("#0", text="Категория / фильм (двойной клик по фильму — его награды)")
        self.tree.heading("who", text="Персоны")
        self.tree.column("#0", width=470)
        self.tree.column("who", width=330)
        self.tree.tag_configure("win", background="#3b1d4d", foreground="#e9d5ff")
        self.tree.tag_configure("cat", font=("Segoe UI", 10, "bold"))
        self.tree.pack(fill="both", expand=True, padx=12, pady=(8, 12))
        self.tree.bind("<Double-1>", self._on_open_film)

        self._noms: dict[str, imdb_api.EventNomination] = {}
        run_bg(self._load, event_id, year)

    def _load(self, event_id: str, year: int) -> None:
        try:
            edition = imdb_api.fetch_event(event_id, year)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.sub_var.set(f"Ошибка: {exc}"))
            return
        self.after(0, lambda: self._show(edition))

    def _show(self, ed: imdb_api.EventEdition) -> None:
        self.info_var.set(f"🎪 {ed.name} {ed.year}")
        total = sum(len(c.nominations) for c in ed.categories)
        self.sub_var.set(f"{len(ed.categories)} категорий · {total} номинаций")
        self.tree.delete(*self.tree.get_children())
        for ci, cat in enumerate(ed.categories):
            parent = self.tree.insert(
                "", "end", iid=f"c{ci}", text=cat.category, open=False, tags=("cat",)
            )
            for ni, n in enumerate(cat.nominations):
                films = ", ".join(
                    f"{t}{f' ({y})' if y else ''}" for _tid, t, y in n.titles
                )
                names = ", ".join(t for _nid, t in n.names)
                mark = "🏆 " if n.is_winner else "· "
                iid = f"c{ci}n{ni}"
                self._noms[iid] = n
                self.tree.insert(
                    parent, "end", iid=iid, text=f"{mark}{films or names}",
                    values=(names if films else "",),
                    tags=("win",) if n.is_winner else (),
                )

    def _on_open_film(self, _e) -> None:
        sel = self.tree.selection()
        if not sel or sel[0] not in self._noms:
            return
        n = self._noms[sel[0]]
        if n.titles:
            tid, title, _y = n.titles[0]
            self.app.open_imdb_title(tid, title)
