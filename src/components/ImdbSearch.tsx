"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ImdbAwardsPayload, ImdbNomination, ImdbSearchResult } from "@/lib/imdb";
import { imdbTypeLabel } from "@/lib/imdb";
import ImdbGallery from "./ImdbGallery";

type Phase = "idle" | "searching" | "picked" | "loading" | "done" | "error";

interface Group {
  eventId: string;
  eventName: string;
  year?: number;
  items: ImdbNomination[];
}

function groupNoms(noms: ImdbNomination[]): Group[] {
  const groups: Group[] = [];
  for (const n of noms) {
    let g = groups.find((x) => x.eventId === n.eventId && x.year === n.year);
    if (!g) {
      g = { eventId: n.eventId, eventName: n.eventName, year: n.year, items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
  }
  groups.sort(
    (a, b) =>
      b.items.filter((i) => i.isWinner).length -
        a.items.filter((i) => i.isWinner).length || b.items.length - a.items.length,
  );
  return groups;
}

export default function ImdbSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlId = searchParams.get("id") ?? "";

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImdbSearchResult[]>([]);
  const [payload, setPayload] = useState<ImdbAwardsPayload | null>(null);
  const [filter, setFilter] = useState("");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const loadedIdRef = useRef<string | null>(null);

  // load awards when ?id= is present
  useEffect(() => {
    if (!urlId || loadedIdRef.current === urlId) return;
    loadedIdRef.current = urlId;
    setPhase("loading");
    setError(null);
    setPayload(null);
    fetch(`/api/imdb/awards?id=${urlId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
        setPayload(data.payload);
        setPhase("done");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Ошибка");
        setPhase("error");
      });
  }, [urlId]);

  async function doSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setPhase("searching");
    setError(null);
    setPayload(null);
    loadedIdRef.current = null; // allow re-picking the same title after a new search
    try {
      const res = await fetch(`/api/imdb/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      setResults(data.results);
      setPhase("picked");
      router.replace(`/imdb?q=${encodeURIComponent(q)}`, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка поиска");
      setPhase("error");
    }
  }

  function pick(r: ImdbSearchResult) {
    router.push(`/imdb?q=${encodeURIComponent(query)}&id=${r.id}`, { scroll: false });
  }

  const noms = payload?.nominations ?? [];
  const q = filter.trim().toLowerCase();
  const filtered = noms.filter((n) => {
    if (winnersOnly && !n.isWinner) return false;
    if (!q) return true;
    return (
      n.eventName.toLowerCase().includes(q) ||
      (n.category ?? "").toLowerCase().includes(q) ||
      (n.awardText ?? "").toLowerCase().includes(q) ||
      n.nominees.some((p) => p.name.toLowerCase().includes(q))
    );
  });
  const groups = groupNoms(filtered);
  const winsCount = noms.filter((n) => n.isWinner).length;

  return (
    <div>
      {/* search form */}
      <form onSubmit={doSearch} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="imdb-title-search" className="sr-only">Название фильма для поиска на IMDb</label>
        <input
          id="imdb-title-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название фильма на английском, например: Anora"
          className="flex-1 rounded-xl border border-yellow-200/20 bg-white/10 px-5 py-4 text-base text-white placeholder-slate-400 outline-none backdrop-blur transition focus:border-yellow-400/60 focus:bg-white/15"
        />
        <button
          type="submit"
          disabled={phase === "searching" || query.trim().length < 2}
          className="rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-yellow-500/25 transition hover:brightness-110 disabled:opacity-50"
        >
          {phase === "searching" ? "Ищем…" : "Найти на IMDb"}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
        </div>
      )}

      {/* search results grid */}
      {(phase === "picked" || (results.length > 0 && !payload && phase !== "loading")) && (
        <div className="mt-6">
          <div className="mb-3 text-sm text-slate-500">
            Найдено вариантов: {results.length} — выберите нужный
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r)}
                className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-yellow-400/50 hover:bg-white/10"
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-20 w-14 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-white/10 text-2xl">
                    🎬
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-white group-hover:text-yellow-300">
                    {r.title}{" "}
                    {r.year && <span className="font-normal text-slate-400">({r.year})</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[imdbTypeLabel(r.type), r.actors].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{r.id}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* loading awards */}
      {phase === "loading" && (
        <div role="status" aria-live="polite" className="mt-6 flex items-center gap-3 rounded-2xl border border-yellow-200/20 bg-yellow-500/10 px-5 py-5 text-yellow-200">
          <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent" />
          Загружаем карточку и все награды с IMDb — большие списки обрабатываются
          страница за страницей…
        </div>
      )}

      {/* awards view */}
      {phase === "done" && payload && payload.partial && (
        <div role="status" className="mt-8 -mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-5 py-3 text-sm text-amber-200">
          Данные неполные: IMDb ограничил запросы, загружено {noms.length} из{" "}
          {payload.stats.nominationCount + payload.stats.winCount} номинаций. Откройте
          страницу ещё раз через 10 минут — догрузим остальное.
        </div>
      )}
      {phase === "done" && payload && (
        <div className="mt-8">
          {/* title card */}
          <div className="flex flex-wrap items-start gap-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            {payload.title.imageUrl && (
              <ImdbGallery
                imdbId={payload.title.id}
                posterUrl={payload.title.imageUrl}
                title={payload.title.title}
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-white">
                {payload.title.title}{" "}
                {payload.title.year && (
                  <span className="font-normal text-slate-400">({payload.title.year})</span>
                )}
              </h2>
              {payload.title.originalTitle &&
                payload.title.originalTitle !== payload.title.title && (
                  <div className="text-sm text-slate-500">{payload.title.originalTitle}</div>
                )}
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                {payload.title.rating && (
                  <span className="rounded-full bg-yellow-500/20 px-2.5 py-1 font-semibold text-yellow-300">
                    ★ {payload.title.rating}
                  </span>
                )}
                {payload.title.genres?.map((g) => (
                  <span key={g} className="rounded-full bg-white/10 px-2.5 py-1">
                    {g}
                  </span>
                ))}
              </div>
              {payload.title.plot && (
                <p className="mt-2 line-clamp-3 text-sm text-slate-400">{payload.title.plot}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`https://www.imdb.com/title/${payload.title.id}/awards/`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:border-yellow-400/50 hover:text-yellow-300"
                >
                  Открыть на IMDb ↗
                </a>
                <a
                  href={`/api/export/imdb/xlsx?id=${payload.title.id}`}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  ⬇ XLSX
                </a>
                <a
                  href={`/api/export/imdb/md?id=${payload.title.id}`}
                  className="rounded-lg bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                >
                  ⬇ Markdown
                </a>
                <a
                  href={`/api/export/imdb/html?id=${payload.title.id}`}
                  className="rounded-lg bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
                >
                  ⬇ HTML
                </a>
              </div>
            </div>
            {/* stats */}
            <div className="flex gap-3">
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-center">
                <div className="text-2xl font-bold text-yellow-300">
                  {payload.stats.winCount}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-400">Побед</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                <div className="text-2xl font-bold text-white">
                  {payload.stats.nominationCount}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Номинаций
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                <div className="text-2xl font-bold text-white">
                  {groupNoms(noms).length}
                </div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Событий
                </div>
              </div>
            </div>
          </div>

          {/* filters */}
          <div className="sticky top-0 z-10 -mx-4 mt-5 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="imdb-awards-filter" className="sr-only">Фильтр наград IMDb</label>
              <input
                id="imdb-awards-filter"
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Фильтр: событие, категория, персона…"
                className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-yellow-400/50"
              />
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={winnersOnly}
                  onChange={(e) => setWinnersOnly(e.target.checked)}
                  className="h-4 w-4 accent-yellow-500"
                />
                только победы 🏆
              </label>
              <span className="text-xs text-slate-500">
                показано {filtered.length} из {noms.length}
              </span>
            </div>
          </div>

          {/* groups */}
          <div className="mt-5 space-y-4">
            {groups.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-slate-500">
                Ничего не найдено
              </div>
            )}
            {groups.map((g) => {
              const key = `${g.eventId}:${g.year}`;
              const gWins = g.items.filter((n) => n.isWinner).length;
              const isOpen = expanded.has(key) || groups.length <= 3 || q !== "" || winnersOnly;
              return (
                <section
                  key={key}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                >
                  <button
                    onClick={() => {
                      const next = new Set(expanded);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      setExpanded(next);
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-white/10 to-transparent px-5 py-3 text-left"
                  >
                    <h3 className="text-base font-semibold text-white">
                      {g.eventName} <span className="text-slate-400">{g.year ?? ""}</span>
                      {g.eventId && g.year && (
                        <a
                          href={`/event?id=${g.eventId}&year=${g.year}&name=${encodeURIComponent(g.eventName)}`}
                          onClick={(ev) => ev.stopPropagation()}
                          title={`Все номинанты: ${g.eventName} ${g.year}`}
                          className="ml-2 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gradient-to-br from-purple-400/25 to-fuchsia-500/25 align-[2px] text-[12px] transition hover:from-purple-400 hover:to-fuchsia-500"
                        >
                          🎪
                        </a>
                      )}
                      {gWins > 0 && (
                        <span className="ml-2 rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-semibold text-yellow-300">
                          🏆 {gWins}
                        </span>
                      )}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {g.items.length} номин.
                      </span>
                    </h3>
                    <span className="text-slate-500">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-white/5">
                      {g.items.map((n, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 px-5 py-3 ${
                            n.isWinner ? "bg-yellow-500/10" : ""
                          }`}
                        >
                          <span className="mt-0.5 w-6 shrink-0 text-center">
                            {n.isWinner ? "🏆" : "·"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={
                                n.isWinner
                                  ? "font-semibold text-yellow-200"
                                  : "text-slate-200"
                              }
                            >
                              {[n.awardText, n.category].filter(Boolean).join(" · ")}
                              {n.isWinner && (
                                <span className="ml-2 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-300">
                                  ПОБЕДА
                                </span>
                              )}
                            </div>
                            {n.nominees.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {n.nominees.map((p, j) => (
                                  <span
                                    key={j}
                                    className="flex items-center rounded-full bg-white/5 text-xs text-slate-300"
                                  >
                                    <a
                                      href={p.id ? `https://www.imdb.com/name/${p.id}/` : undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-1.5 py-0.5 pl-0.5 pr-1.5 transition hover:text-yellow-300"
                                    >
                                      {p.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={p.imageUrl}
                                          alt=""
                                          referrerPolicy="no-referrer"
                                          className="h-5 w-5 rounded-full object-cover"
                                        />
                                      ) : (
                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px]">
                                          👤
                                        </span>
                                      )}
                                      {p.name}
                                    </a>
                                    {p.id && (
                                      <a
                                        href={`/person?id=${p.id}`}
                                        title={`Все фильмы и награды: ${p.name}`}
                                        className="mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400/30 to-amber-500/30 text-[10px] transition hover:from-yellow-400 hover:to-amber-500"
                                      >
                                        ⭐
                                      </a>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {n.notes && (
                              <div className="mt-1 text-xs text-slate-500">{n.notes}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
