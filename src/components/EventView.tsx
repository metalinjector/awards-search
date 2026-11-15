"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { EventEditionPayload, EventEntity } from "@/lib/imdb-event";

export default function EventView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const year = searchParams.get("year") ?? "";

  const [payload, setPayload] = useState<EventEditionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const loadedRef = useRef<string | null>(null);

  const key = `${id}:${year}`;

  useEffect(() => {
    if (!id || !year || loadedRef.current === key) return;
    loadedRef.current = key;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/imdb/event?id=${id}&year=${year}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
          setPayload(data.payload);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [id, year, key]);

  if (!id || !year) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-slate-400">
        Не указано событие. Откройте его со страницы наград фильма.
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const categories = (payload?.categories ?? [])
    .map((cat) => ({
      ...cat,
      nominations: cat.nominations.filter((n) => {
        if (winnersOnly && !n.isWinner) return false;
        if (!q) return true;
        return (
          cat.category.toLowerCase().includes(q) ||
          n.titles.some((t) => t.text.toLowerCase().includes(q)) ||
          n.names.some((p) => p.text.toLowerCase().includes(q))
        );
      }),
    }))
    .filter((cat) => cat.nominations.length > 0);

  const stats = payload
    ? {
        categories: payload.categories.length,
        nominations: payload.categories.reduce((s, c) => s + c.nominations.length, 0),
        films: new Set(
          payload.categories.flatMap((c) =>
            c.nominations.flatMap((n) => n.titles.map((t) => t.id)),
          ),
        ).size,
      }
    : null;

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-purple-300/20 bg-purple-500/10 px-5 py-5 text-purple-200">
          <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-purple-300 border-t-transparent" />
          Загружаем всех номинантов церемонии с IMDb…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
        </div>
      )}

      {payload && stats && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-purple-300/30 bg-purple-500/10 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-purple-300">{stats.categories}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">категорий</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-white">{stats.nominations}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">номинаций</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-white">{stats.films}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">фильмов</div>
            </div>
            <a
              href={`https://www.imdb.com/event/${payload.eventId}/${payload.year}/`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:border-purple-300/50 hover:text-purple-300"
            >
              Открыть на IMDb ↗
            </a>
          </div>

          <div className="sticky top-0 z-10 -mx-4 mt-5 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="event-filter" className="sr-only">Фильтр номинантов церемонии</label>
              <input
                id="event-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Фильтр: категория, фильм, персона…"
                className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-purple-300/50"
              />
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={winnersOnly}
                  onChange={(e) => setWinnersOnly(e.target.checked)}
                  className="h-4 w-4 accent-purple-400"
                />
                только победители 🏆
              </label>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            {categories.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-slate-500">
                Ничего не найдено
              </div>
            )}
            {categories.map((cat, ci) => (
              <section
                key={ci}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                <h3 className="border-b border-white/10 bg-gradient-to-r from-purple-500/15 to-transparent px-5 py-3 text-base font-semibold text-purple-300">
                  {cat.category}
                  {cat.award && cat.award !== cat.category && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {cat.award}
                    </span>
                  )}
                </h3>
                <div className="divide-y divide-white/5">
                  {cat.nominations.map((n, ni) => (
                    <div
                      key={ni}
                      className={`flex items-start gap-3 px-5 py-3 ${
                        n.isWinner ? "bg-purple-500/10" : ""
                      }`}
                    >
                      <span className="mt-0.5 w-6 shrink-0 text-center">
                        {n.isWinner ? "🏆" : "·"}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={
                            n.isWinner
                              ? "font-semibold text-purple-200"
                              : "text-slate-200"
                          }
                        >
                          <Entities
                            items={n.titles}
                            winner={n.isWinner}
                            primary
                          />
                          {n.titles.length > 0 && n.names.length > 0 && (
                            <span className="text-slate-500"> — </span>
                          )}
                          <Entities items={n.names} winner={n.isWinner} />
                          {n.isWinner && (
                            <span className="ml-2 rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-300">
                              ПОБЕДА
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Entities({
  items,
  winner,
  primary = false,
}: {
  items: EventEntity[];
  winner: boolean;
  primary?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((e, i) => (
        <span key={`${e.id}-${i}`}>
          {i > 0 && ", "}
          <a
            href={
              e.kind === "title"
                ? `https://www.imdb.com/title/${e.id}/`
                : `https://www.imdb.com/name/${e.id}/`
            }
            target="_blank"
            rel="noreferrer"
            className={`underline decoration-white/20 underline-offset-2 hover:text-purple-300 ${
              primary && !winner ? "text-white" : ""
            }`}
          >
            {e.text}
          </a>
          {e.kind === "title" && e.year ? (
            <span className="text-slate-500"> ({e.year})</span>
          ) : null}
          {e.kind === "title" && (
            <Link
              href={`/imdb?q=${encodeURIComponent(e.text)}&id=${e.id}`}
              title={`Все награды фильма «${e.text}»`}
              className="ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-yellow-400/25 to-amber-500/25 align-[2px] text-[10px] no-underline transition hover:from-yellow-400 hover:to-amber-500"
            >
              🏆
            </Link>
          )}
          {e.kind === "name" && (
            <Link
              href={`/person?id=${e.id}`}
              title={`Все фильмы и награды: ${e.text}`}
              className="ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-yellow-400/25 to-amber-500/25 align-[2px] text-[10px] no-underline transition hover:from-yellow-400 hover:to-amber-500"
            >
              ⭐
            </Link>
          )}
        </span>
      ))}
    </>
  );
}
