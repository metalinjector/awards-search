"""Вкладка TMDB: ключ API, поиск (в т.ч. по-русски) и переход к наградам IMDb."""

from __future__ import annotations

import threading
import tkinter as tk
from tkinter import messagebox, ttk

from . import tmdb_api

BG = "#0f172a"
ACCENT = "#fbbf24"


def run_bg(fn, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


class TmdbTab(ttk.Frame):
    def __init__(self, parent, app) -> None:
        super().__init__(parent, padding=10)
        self.app = app
        self._results: list[tmdb_api.TmdbResult] = []
        self._build()
        self._refresh_key_state()

    def _build(self) -> None:
        ttk.Label(self, text="🎬 TMDB — поиск фильма (можно по-русски)", style="Header.TLabel").pack(anchor="w")
        ttk.Label(
            self,
            text="TMDB не хранит награды: после выбора фильма определяется его IMDb ID "
            "и открывается вкладка IMDb с полным отчётом о наградах.",
            style="Muted.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        # --- ключ ---
        key_frame = ttk.Frame(self)
        key_frame.pack(fill="x", pady=(0, 8))
        self.key_state_var = tk.StringVar(value="")
        ttk.Label(key_frame, textvariable=self.key_state_var, style="Muted.TLabel").pack(anchor="w")
        row = ttk.Frame(key_frame)
        row.pack(fill="x", pady=(4, 0))
        self.key_var = tk.StringVar()
        self.key_entry = ttk.Entry(row, textvariable=self.key_var, show="•", font=("Segoe UI", 10))
        self.key_entry.pack(side="left", fill="x", expand=True, ipady=3)
        ttk.Button(row, text="Сохранить ключ", command=self.on_save_key).pack(side="left", padx=(8, 0))
        ttk.Button(row, text="Удалить", command=self.on_delete_key).pack(side="left", padx=(6, 0))

        # --- поиск ---
        srow = ttk.Frame(self)
        srow.pack(fill="x")
        self.query_var = tk.StringVar()
        entry = ttk.Entry(srow, textvariable=self.query_var, font=("Segoe UI", 12))
        entry.pack(side="left", fill="x", expand=True, ipady=4)
        entry.bind("<Return>", lambda _e: self.on_search())
        ttk.Button(srow, text="Найти в TMDB", command=self.on_search).pack(side="left", padx=(8, 0))

        self.status_var = tk.StringVar(value="")
        ttk.Label(self, textvariable=self.status_var, style="Muted.TLabel").pack(anchor="w", pady=(6, 0))

        self.tree = ttk.Treeview(
            self, columns=("year", "type", "orig", "rating"), show="tree headings"
        )
        for col, text, w in (
            ("#0", "Название (двойной клик — награды через IMDb)", 340),
            ("year", "Год", 60), ("type", "Тип", 80),
            ("orig", "Оригинал", 260), ("rating", "★", 60),
        ):
            self.tree.heading(col, text=text)
            self.tree.column(col, width=w, anchor="center" if col in ("year", "rating") else "w")
        self.tree.pack(fill="both", expand=True, pady=(8, 0))
        self.tree.bind("<Double-1>", lambda _e: self.on_pick())

        ttk.Label(
            self,
            text="This product uses the TMDB API but is not endorsed or certified by TMDB.",
            style="Muted.TLabel",
        ).pack(anchor="center", pady=(6, 0))

    # ------------------------ ключ ------------------------

    def _refresh_key_state(self) -> None:
        if tmdb_api.load_key():
            self.key_state_var.set("🔑 Ключ TMDB сохранён — поиск активен.")
        else:
            self.key_state_var.set(
                "🔑 Нужен бесплатный ключ TMDB: themoviedb.org → Settings → API. "
                "Вставьте «API Key (v3)» или «Read Access Token (v4)» и нажмите «Сохранить ключ»."
            )

    def on_save_key(self) -> None:
        key = self.key_var.get().strip()
        if len(key) < 10:
            messagebox.showinfo("Ключ TMDB", "Вставьте ключ целиком.")
            return
        self.status_var.set("Проверяем ключ запросом к TMDB…")
        run_bg(self._do_save_key, key)

    def _do_save_key(self, key: str) -> None:
        ok = tmdb_api.validate_key(key)

        def done() -> None:
            if ok:
                tmdb_api.save_key(key)
                self.key_var.set("")
                self._refresh_key_state()
                self.status_var.set("Ключ проверен и сохранён.")
            else:
                self.status_var.set("")
                messagebox.showwarning(
                    "Ключ TMDB",
                    "TMDB отклонил этот ключ. Убедитесь, что скопировали "
                    "«API Key (v3 auth)» или «API Read Access Token» целиком.",
                )

        self.after(0, done)

    def on_delete_key(self) -> None:
        tmdb_api.delete_key()
        self._refresh_key_state()
        self.status_var.set("Ключ удалён.")

    # ------------------------ поиск ------------------------

    def on_search(self) -> None:
        query = self.query_var.get().strip()
        if len(query) < 2:
            messagebox.showinfo("Поиск", "Введите минимум 2 символа названия.")
            return
        if not tmdb_api.load_key():
            messagebox.showinfo("Ключ TMDB", "Сначала сохраните ключ TMDB (поле выше).")
            return
        self.status_var.set(f"Ищем «{query}» в TMDB…")
        run_bg(self._do_search, query)

    def _do_search(self, query: str) -> None:
        try:
            results = tmdb_api.search(query)
        except PermissionError:
            self.after(0, lambda: self.status_var.set(
                "Ключ TMDB отсутствует или отклонён — сохраните корректный ключ."))
            return
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.status_var.set(f"Ошибка поиска: {exc}"))
            return
        self.after(0, lambda: self._show(results))

    def _show(self, results: list[tmdb_api.TmdbResult]) -> None:
        self._results = results
        self.tree.delete(*self.tree.get_children())
        for i, r in enumerate(results):
            self.tree.insert(
                "", "end", iid=str(i), text=r.title,
                values=(
                    r.year or "", "Сериал" if r.media_type == "tv" else "Фильм",
                    r.original_title, f"{r.rating:.1f}" if r.rating else "",
                ),
            )
        self.status_var.set(
            f"Найдено: {len(results)}. Двойной клик — открыть награды." if results
            else "Ничего не найдено."
        )

    def on_pick(self) -> None:
        sel = self.tree.selection()
        if not sel:
            return
        r = self._results[int(sel[0])]
        self.status_var.set(f"Определяем IMDb ID для «{r.title}»…")
        run_bg(self._do_resolve, r)

    def _do_resolve(self, r: tmdb_api.TmdbResult) -> None:
        try:
            imdb_id = tmdb_api.resolve_imdb_id(r.tmdb_id, r.media_type)
        except Exception as exc:  # noqa: BLE001
            self.after(0, lambda: self.status_var.set(f"Ошибка: {exc}"))
            return

        def done() -> None:
            if not imdb_id:
                self.status_var.set("")
                messagebox.showinfo(
                    "IMDb ID",
                    f"У «{r.title}» в TMDB не указан IMDb ID — награды получить "
                    "не из чего. Попробуйте другой вариант или вкладку IMDb.",
                )
                return
            self.status_var.set(f"Открываем награды «{r.title}»…")
            self.app.open_imdb_title(imdb_id, r.title)

        self.after(0, done)
