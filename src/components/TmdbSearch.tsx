"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { TmdbSearchResult } from "@/lib/tmdb";

type Phase = "idle" | "searching" | "results" | "resolving" | "error";

export default function TmdbSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/tmdb/status")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.configured));
      })
      .catch(() => setConfigured(null));
  }, []);

  async function doSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setPhase("searching");
    setError(null);
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        if (data.configured === false) {
          setConfigured(false);
          setPhase("idle");
          return;
        }
        throw new Error(data.error ?? "Ошибка поиска");
      }
      setResults(data.results);
      setPhase("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка поиска");
      setPhase("error");
    }
  }

  async function pick(r: TmdbSearchResult) {
    setPhase("resolving");
    setResolvingId(r.id);
    setError(null);
    try {
      const res = await fetch(`/api/tmdb/resolve?id=${r.id}&type=${r.mediaType}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      if (!data.imdbId) {
        setError(
          `У «${r.title}» в TMDB не указан IMDb ID — награды получить не из чего. Попробуйте другой вариант или поиск через IMDb.`,
        );
        setPhase("results");
        setResolvingId(null);
        return;
      }
      // Reuse the full IMDb awards module
      router.push(`/imdb?q=${encodeURIComponent(r.title)}&id=${data.imdbId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setPhase("results");
      setResolvingId(null);
    }
  }

  return (
    <div>
      {configured === false && (
        <div className="mb-5 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-5 text-sm text-sky-200">
          <div className="font-semibold">TMDB временно не настроен</div>
          <p className="mt-2 text-sky-300/80">
            Ключ задаёт администратор сервиса через защищённую конфигурацию. Пока можно
            искать фильмы и награды через{" "}
            <a href="/imdb" className="underline">IMDb</a>.
          </p>
        </div>
      )}

      <form onSubmit={doSearch} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="tmdb-title-search" className="sr-only">Название фильма или сериала для поиска в TMDB</label>
        <input
          id="tmdb-title-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название фильма или сериала (можно по-русски), например: Анора"
          className="flex-1 rounded-xl border border-teal-200/20 bg-white/10 px-5 py-4 text-base text-white placeholder-slate-400 outline-none backdrop-blur transition focus:border-teal-400/60 focus:bg-white/15"
          disabled={configured === false}
        />
        <button
          type="submit"
          disabled={phase === "searching" || query.trim().length < 2 || configured === false}
          className="rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:brightness-110 disabled:opacity-50"
        >
          {phase === "searching" ? "Ищем…" : "Найти в TMDB"}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
        </div>
      )}

      {phase === "resolving" && (
        <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3 rounded-xl border border-teal-200/20 bg-teal-500/10 px-5 py-4 text-teal-200">
          <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
          Определяем IMDb ID через TMDB и открываем награды…
        </div>
      )}

      {(phase === "results" || (phase === "resolving" && results.length > 0)) && (
        <div className="mt-6">
          <div className="mb-3 text-sm text-slate-500">
            Найдено: {results.length} — выберите нужный вариант
          </div>
          {results.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-slate-400">
              Ничего не найдено. Попробуйте оригинальное название.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((r) => (
              <button
                key={`${r.mediaType}-${r.id}`}
                onClick={() => pick(r)}
                disabled={phase === "resolving"}
                className="group flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-teal-400/50 hover:bg-white/10 disabled:opacity-60"
              >
                {r.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.posterUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-24 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md bg-white/10 text-2xl">
                    🎬
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white group-hover:text-teal-300">
                    {resolvingId === r.id && phase === "resolving" ? "⏳ " : ""}
                    {r.title}{" "}
                    {r.year && <span className="font-normal text-slate-400">({r.year})</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {r.mediaType === "tv" ? "Сериал" : "Фильм"}
                    {r.originalTitle && r.originalTitle !== r.title
                      ? ` · ${r.originalTitle}`
                      : ""}
                    {r.rating ? ` · ★ ${r.rating.toFixed(1)}` : ""}
                  </div>
                  {r.overview && (
                    <div className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {r.overview}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
