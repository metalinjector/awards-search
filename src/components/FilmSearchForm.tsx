"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { KpSuggestItem } from "@/lib/kp-suggest";

export default function FilmSearchForm({
  defaultQuery = "",
  defaultYear,
  defaultKpId,
}: {
  defaultQuery?: string;
  defaultYear?: number;
  /** Kinopoisk id of the film picked earlier — keeps the search exact */
  defaultKpId?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(defaultQuery);
  const [year, setYear] = useState<string>(defaultYear ? String(defaultYear) : "");
  const [error, setError] = useState<string | null>(null);
  // set when the film was picked from Kinopoisk; typing a different title clears it
  const [kpId, setKpId] = useState<string | undefined>(defaultKpId);

  // "Подобрать" modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<KpSuggestItem[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    const y = parseInt(year, 10);
    if (query.length < 2) {
      setError("Введите название фильма (минимум 2 символа)");
      return;
    }
    if (!Number.isFinite(y) || y < 1900 || y > 2100) {
      setError("Укажите год выпуска фильма, например 2012");
      return;
    }
    setError(null);
    router.push(
      `/film?q=${encodeURIComponent(query)}&year=${y}` + (kpId ? `&kp=${kpId}` : ""),
    );
  }

  async function openPicker() {
    const query = q.trim();
    if (query.length < 2) {
      setError("Введите название фильма (минимум 2 символа), чтобы подобрать");
      return;
    }
    setError(null);
    setPickerOpen(true);
    setPickerLoading(true);
    setPickerError(null);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/search/kp-suggest?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      // newest films first; entries without a year go last
      const sorted = [...(data.results as KpSuggestItem[])].sort(
        (a, b) => (b.year ?? 0) - (a.year ?? 0),
      );
      setSuggestions(sorted);
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : "Ошибка поиска");
    } finally {
      setPickerLoading(false);
    }
  }

  function pick(item: KpSuggestItem) {
    setQ(item.title);
    setKpId(item.kpId);
    if (item.year) setYear(String(item.year));
    setPickerOpen(false);
  }

  // Esc closes the picker
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setKpId(undefined);
            }}
            placeholder="Название фильма, например: Грешники или Sinners"
            className="w-full rounded-xl border border-amber-200/20 bg-white/10 px-5 py-4 pr-14 text-base text-white placeholder-slate-400 outline-none backdrop-blur transition focus:border-amber-400/60 focus:bg-white/15"
          />
          <button
            type="button"
            onClick={openPicker}
            title="Подобрать: найти фильм на Кинопоиске и подставить его год"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-amber-400/40 bg-amber-500/15 text-amber-300 transition hover:bg-amber-500/30 hover:text-amber-200"
          >
            {/* binoculars icon */}
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5">
              <path d="M4.5 1A1.5 1.5 0 0 0 3 2.5V3h4v-.5A1.5 1.5 0 0 0 5.5 1h-1zM7 4v1h2V4h4v.882a.5.5 0 0 0 .276.447l.895.447A1.5 1.5 0 0 1 15 7.118V13H9v-1.5a.5.5 0 0 1 .146-.354l.854-.853V9.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v.793l.854.853A.5.5 0 0 1 7 11.5V13H1V7.118a1.5 1.5 0 0 1 .83-1.342l.894-.447A.5.5 0 0 0 3 4.882V4h4zM1 14v.5A1.5 1.5 0 0 0 2.5 16h3A1.5 1.5 0 0 0 7 14.5V14H1zm8 0v.5a1.5 1.5 0 0 0 1.5 1.5h3a1.5 1.5 0 0 0 1.5-1.5V14H9zm4-11H9v-.5A1.5 1.5 0 0 1 10.5 1h1A1.5 1.5 0 0 1 13 2.5V3z" />
            </svg>
          </button>
        </div>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="Год фильма"
          min={1900}
          max={2100}
          className="w-full rounded-xl border border-amber-200/20 bg-white/10 px-5 py-4 text-base text-white placeholder-slate-400 outline-none backdrop-blur transition focus:border-amber-400/60 focus:bg-white/15 sm:w-40"
        />
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:brightness-110"
        >
          Найти награды
        </button>
      </form>
      {error && (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {kpId && (
        <div className="mt-2 text-xs text-slate-500">
          Фильм выбран на Кинопоиске — поиск будет точным, по его карточке, а не по
          названию.
        </div>
      )}

      {/* ---------- film picker modal ---------- */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                Кинопоиск: «{q.trim()}»
                {!pickerLoading && suggestions.length > 0 && (
                  <span className="ml-2 font-normal text-slate-400">
                    — {suggestions.length} вариантов
                  </span>
                )}
              </h3>
              <button
                onClick={() => setPickerOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
                title="Закрыть (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {pickerLoading && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200/20 bg-amber-500/10 px-5 py-5 text-sm text-amber-200">
                  <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                  Ищем на Кинопоиске — обычно 10–30 секунд…
                </div>
              )}
              {pickerError && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
                  {pickerError}
                  <button
                    onClick={openPicker}
                    className="ml-3 underline decoration-dotted underline-offset-4 hover:text-red-200"
                  >
                    повторить
                  </button>
                </div>
              )}
              {!pickerLoading && !pickerError && suggestions.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-8 text-center text-sm text-slate-500">
                  Ничего не найдено — попробуйте изменить название
                </div>
              )}
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s.kpId}
                    onClick={() => pick(s)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-amber-400/50 hover:bg-white/10"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.posterUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-24 w-16 shrink-0 rounded-md bg-white/10 object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white group-hover:text-amber-300">
                        {s.title}{" "}
                        {s.year && (
                          <span className="font-normal text-slate-400">({s.year})</span>
                        )}
                      </div>
                      {s.originalTitle && (
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {s.originalTitle}
                        </div>
                      )}
                      {s.director && (
                        <div className="mt-0.5 text-xs text-slate-400">
                          реж. {s.director}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {s.rating && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-300">
                            ★ {s.rating}
                          </span>
                        )}
                        {s.genres && <span>{s.genres}</span>}
                      </div>
                    </div>
                    {s.year && (
                      <span className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-300">
                        → {s.year}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
