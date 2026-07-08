"""Вкладки Кинопоиска: отчёт о премии по URL и поиск фильма по всем премиям."""

from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import exporters, kinopoisk_api as kp

BG = "#0f172a"
ACCENT = "#fbbf24"


def run_bg(fn, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


# =================== вкладка «отчёт о премии» ===================

class KpReportTab(ttk.Frame):
    def __init__(self, parent, app) -> None:
        super().__init__(parent, padding=10)
        self.app = app
        self._report: kp.Report | None = None
        self._build()

    def _build(self) -> None:
        ttk.Label(self, text="🏆 Отчёт о премии Кинопоиска", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            self,
            text="Вставьте ссылку вида https://www.kinopoisk.ru/awards/oscar/2026/ — "
            "получите победителей и номинантов всех категорий.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        row = ttk.Frame(self)
        row.pack(fill="x")
        self.url_var = tk.StringVar()
        entry = ttk.Entry(row, textvariable=self.url_var, font=("Segoe UI", 11))
        entry.pack(side="left", fill="x", expand=True, ipady=4)
        entry.bind("<Return>", lambda _e: self.on_load())
        ttk.Button(row, text="Построить отчёт", command=self.on_load).pack(side="left", padx=(8, 0))

        # примеры
        ex_row = ttk.Frame(self)
        ex_row.pack(fill="x", pady=(6, 0))
        for label, url in (
            ("Оскар 2026", "https://www.kinopoisk.ru/awards/oscar/2026/"),
            ("Оскар 2020", "https://www.kinopoisk.ru/awards/oscar/2020/"),
            ("Сезар 2025", "https://www.kinopoisk.ru/awards/cesar/2025/"),
            ("BAFTA 2025", "https://www.kinopoisk.ru/awards/bafta/2025/"),
        ):
            ttk.Button(
                ex_row, text=label,
                command=lambda u=url: (self.url_var.set(u), self.on_load()),
            ).pack(side="left", padx=(0, 6))

        self.status_var = tk.StringVar(value="Готово.")
        ttk.Label(self, textvariable=self.status_var, style="Muted.TLabel").pack(anchor="w", pady=(6, 0))
        self.stats_var = tk.StringVar(value="")
        ttk.Label(
            self, textvariable=self.stats_var, background=BG,
            foreground=ACCENT, font=("Segoe UI", 11, "bold"),
        ).pack(anchor="w")

        self.tree = ttk.Treeview(self, columns=("en",), show="tree headings")
        self.tree.heading("#0", text="Категория / номинант")
        self.tree.heading("en", text="Оригинал")
        self.tree.column("#0", width=520)
        self.tree.column("en", width=350)
        self.tree.tag_configure("win", background="#493b12", foreground="#fde68a")
        self.tree.tag_configure("cat", font=("Segoe UI", 10, "bold"))
        self.tree.pack(fill="both", expand=True, pady=(6, 0))

        btns = ttk.Frame(self)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="💾 Markdown", command=self.on_md).pack(side="left")
        ttk.Button(btns, text="💾 HTML", command=self.on_html).pack(side="left", padx=8)
        ttk.Button(btns, text="💾 XLSX", command=self.on_xlsx).pack(side="left")

    def on_load(self) -> None:
        parsed = kp.parse_award_url(self.url_var.get())
        if not parsed:
            messagebox.showinfo(
                "Ссылка",
                "Ссылка не распознана. Ожидается адрес вида\n"
                "https://www.kinopoisk.ru/awards/oscar/2026/",
            )
            return
        slug, year = parsed
        self.status_var.set(f"Загружаем {slug} {year} (10–40 секунд при первом запросе)…")
        run_bg(self._do_load, slug, year)

    def _do_load(self, slug: str, year: int) -> None:
        try:
            report = kp.fetch_report(slug, year)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.status_var.set(f"Ошибка: {exc}"))
            return
        self.after(0, lambda: self._show(report))

    def _show(self, r: kp.Report) -> None:
        self._report = r
        self.tree.delete(*self.tree.get_children())
        total, wins = 0, 0
        for ci, cat in enumerate(r.categories):
            parent = self.tree.insert("", "end", iid=f"c{ci}", text=cat.name, open=False, tags=("cat",))
            for ei, e in enumerate(sorted(cat.entries, key=lambda x: not x.winner)):
                total += 1
                if e.winner:
                    wins += 1
                mark = "🏆 " if e.winner else "· "
                self.tree.insert(
                    parent, "end", iid=f"c{ci}e{ei}", text=f"{mark}{e.ru}",
                    values=(e.en,), tags=("win",) if e.winner else (),
                )
        self.stats_var.set(
            f"{r.award_name} {r.year}: {len(r.categories)} категорий · "
            f"{total} номинаций · 🏆 {wins} наград"
        )
        self.status_var.set("Готово. Экспорт — кнопки ниже.")

    def _save(self, ext: str, build) -> None:
        if not self._report:
            messagebox.showinfo("Экспорт", "Сначала постройте отчёт.")
            return
        r = self._report
        path = filedialog.asksaveasfilename(
            defaultextension=f".{ext}",
            initialfile=f"{r.slug}-{r.year}.{ext}",
            filetypes=[(ext.upper(), f"*.{ext}")],
        )
        if not path:
            return
        try:
            build(r, path)
        except RuntimeError as exc:
            messagebox.showwarning("Экспорт", str(exc))
            return
        self.status_var.set(f"Сохранено: {path}")

    def on_md(self) -> None:
        self._save("md", lambda r, p: Path(p).write_text(
            exporters.kp_report_markdown(r), encoding="utf-8"))

    def on_html(self) -> None:
        self._save("html", lambda r, p: Path(p).write_text(
            exporters.kp_report_html(r), encoding="utf-8"))

    def on_xlsx(self) -> None:
        self._save("xlsx", lambda r, p: exporters.kp_report_xlsx(r, p))


# =================== вкладка «поиск фильма» ===================

class KpFilmTab(ttk.Frame):
    def __init__(self, parent, app) -> None:
        super().__init__(parent, padding=10)
        self.app = app
        self._matches: list[kp.FilmMatch] = []
        self._query = ""
        self._year = 0
        self._scanning = False
        self._build()

    def _build(self) -> None:
        ttk.Label(self, text="🎞️ Найти все награды фильма (Кинопоиск)", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            self,
            text="Сканируются все 24 премии Кинопоиска за 3 года (год фильма и два "
            "следующих). Первое сканирование года — несколько минут, повторное — мгновенно.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        row = ttk.Frame(self)
        row.pack(fill="x")
        self.query_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.query_var, font=("Segoe UI", 11)).pack(
            side="left", fill="x", expand=True, ipady=4
        )
        self.year_var = tk.StringVar()
        ttk.Entry(row, textvariable=self.year_var, width=8, font=("Segoe UI", 11)).pack(
            side="left", padx=8, ipady=4
        )
        ttk.Button(row, text="Найти награды", command=self.on_scan).pack(side="left")

        self.progress = ttk.Progressbar(self, mode="determinate")
        self.progress.pack(fill="x", pady=(8, 0))
        self.status_var = tk.StringVar(value="Введите название фильма и год выпуска.")
        ttk.Label(self, textvariable=self.status_var, style="Muted.TLabel").pack(anchor="w", pady=(4, 0))
        self.stats_var = tk.StringVar(value="")
        ttk.Label(
            self, textvariable=self.stats_var, background=BG,
            foreground=ACCENT, font=("Segoe UI", 11, "bold"),
        ).pack(anchor="w")

        self.tree = ttk.Treeview(self, columns=("detail",), show="tree headings")
        self.tree.heading("#0", text="Премия / категория")
        self.tree.heading("detail", text="Номинант")
        self.tree.column("#0", width=440)
        self.tree.column("detail", width=420)
        self.tree.tag_configure("win", background="#493b12", foreground="#fde68a")
        self.tree.tag_configure("award", font=("Segoe UI", 10, "bold"))
        self.tree.pack(fill="both", expand=True, pady=(6, 0))

        btns = ttk.Frame(self)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="💾 Markdown", command=self.on_md).pack(side="left")
        ttk.Button(btns, text="💾 HTML", command=self.on_html).pack(side="left", padx=8)
        ttk.Button(btns, text="💾 XLSX", command=self.on_xlsx).pack(side="left")

    def on_scan(self) -> None:
        if self._scanning:
            return
        query = self.query_var.get().strip()
        year_s = self.year_var.get().strip()
        if len(query) < 2 or not year_s.isdigit():
            messagebox.showinfo("Поиск", "Укажите название фильма (от 2 символов) и год, например 2025.")
            return
        year = int(year_s)
        if not 1900 <= year <= 2100:
            messagebox.showinfo("Поиск", "Год должен быть в диапазоне 1900–2100.")
            return
        self._scanning = True
        self._query, self._year = query, year
        self.progress["value"] = 0
        self.status_var.set("Сканируем премии…")
        run_bg(self._do_scan, query, year)

    def _do_scan(self, query: str, year: int) -> None:
        def progress(done: int, total: int, label: str) -> None:
            self.after(0, lambda: self._on_progress(done, total, label))

        try:
            matches = kp.scan_film(query, year, progress=progress)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.status_var.set(f"Ошибка: {exc}"))
            self._scanning = False
            return
        self.after(0, lambda: self._show(matches))

    def _on_progress(self, done: int, total: int, label: str) -> None:
        self.progress["maximum"] = total
        self.progress["value"] = done
        self.status_var.set(f"Сканирование {done} из {total}: {label}")

    def _show(self, matches: list[kp.FilmMatch]) -> None:
        self._scanning = False
        self._matches = matches
        self.tree.delete(*self.tree.get_children())
        groups: dict[str, list[kp.FilmMatch]] = {}
        for m in matches:
            groups.setdefault(f"{m.award_name} {m.year}", []).append(m)
        for gi, (label, items) in enumerate(groups.items()):
            gw = sum(1 for m in items if m.entry.winner)
            badge = f"  🏆 {gw}" if gw else ""
            parent = self.tree.insert(
                "", "end", iid=f"g{gi}", text=f"{label}{badge}", open=True, tags=("award",)
            )
            for mi, m in enumerate(sorted(items, key=lambda x: not x.entry.winner)):
                mark = "🏆 " if m.entry.winner else "· "
                self.tree.insert(
                    parent, "end", iid=f"g{gi}m{mi}", text=f"{mark}{m.category}",
                    values=(m.entry.ru,), tags=("win",) if m.entry.winner else (),
                )
        wins = sum(1 for m in matches if m.entry.winner)
        self.stats_var.set(
            f"«{self._query}» ({self._year}): 🏆 {wins} побед · {len(matches)} номинаций"
            f" · {len(groups)} премий"
        )
        self.status_var.set(
            "Готово." if matches else
            "Ничего не найдено — попробуйте оригинальное название или другой год."
        )
        self.progress["value"] = self.progress["maximum"] or 1

    def _save(self, ext: str, build) -> None:
        if not self._matches:
            messagebox.showinfo("Экспорт", "Сначала выполните поиск.")
            return
        safe = "".join(c for c in self._query if c.isalnum() or c in " -_").strip()
        path = filedialog.asksaveasfilename(
            defaultextension=f".{ext}",
            initialfile=f"{safe or 'film'}-{self._year}-awards.{ext}",
            filetypes=[(ext.upper(), f"*.{ext}")],
        )
        if not path:
            return
        try:
            build(path)
        except RuntimeError as exc:
            messagebox.showwarning("Экспорт", str(exc))
            return
        self.status_var.set(f"Сохранено: {path}")

    def on_md(self) -> None:
        self._save("md", lambda p: Path(p).write_text(
            exporters.kp_film_markdown(self._query, self._year, self._matches),
            encoding="utf-8"))

    def on_html(self) -> None:
        self._save("html", lambda p: Path(p).write_text(
            exporters.kp_film_html(self._query, self._year, self._matches),
            encoding="utf-8"))

    def on_xlsx(self) -> None:
        self._save("xlsx", lambda p: exporters.kp_film_xlsx(
            self._query, self._year, self._matches, p))
