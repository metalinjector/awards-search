"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Entry, ReportPayload } from "@/lib/types";
import { entryFilms, entryNominee, reportStats } from "@/lib/format";

type Tab = "categories" | "table" | "leaderboard";
type SortKey = "category" | "status" | "nominee" | "film";
type LbSortKey = "rank" | "film" | "nominations" | "wins";

interface FlatRow {
  category: string;
  categoryIndex: number;
  entry: Entry;
  nominee: string;
  film: string;
}

interface Props {
  payload: ReportPayload;
  slug: string;
  fetchedAt: string;
}

export default function ReportView({ payload, slug, fetchedAt }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("categories");
  const [query, setQuery] = useState("");
  const [winnersOnly, setWinnersOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [sortAsc, setSortAsc] = useState(true);
  const [lbSortKey, setLbSortKey] = useState<LbSortKey>("rank");
  const [lbSortAsc, setLbSortAsc] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => reportStats(payload), [payload]);

  const flatRows = useMemo<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    payload.categories.forEach((cat, ci) => {
      for (const e of cat.entries) {
        rows.push({
          category: cat.name,
          categoryIndex: ci,
          entry: e,
          nominee: entryNominee(e),
          film: entryFilms(e),
        });
      }
    });
    return rows;
  }, [payload]);

  const q = query.trim().toLowerCase();

  const matchesEntry = (e: Entry, category: string) => {
    if (winnersOnly && !e.winner) return false;
    if (!q) return true;
    return (
      e.ru.toLowerCase().includes(q) ||
      e.en.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q)
    );
  };

  const filteredCategories = useMemo(() => {
    return payload.categories
      .map((cat) => ({
        name: cat.name,
        entries: cat.entries.filter((e) => matchesEntry(e, cat.name)),
      }))
      .filter((cat) => cat.entries.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, q, winnersOnly]);

  const tableRows = useMemo(() => {
    const rows = flatRows.filter((r) => matchesEntry(r.entry, r.category));
    const dir = sortAsc ? 1 : -1;
    const collator = new Intl.Collator("ru");
    rows.sort((a, b) => {
      switch (sortKey) {
        case "category":
          return (
            (a.categoryIndex - b.categoryIndex) * dir ||
            Number(b.entry.winner) - Number(a.entry.winner)
          );
        case "status":
          return (
            (Number(b.entry.winner) - Number(a.entry.winner)) * dir ||
            a.categoryIndex - b.categoryIndex
          );
        case "nominee":
          return collator.compare(a.nominee, b.nominee) * dir;
        case "film":
          return collator.compare(a.film || a.nominee, b.film || b.nominee) * dir;
      }
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatRows, q, winnersOnly, sortKey, sortAsc]);

  const leaderboardRows = useMemo(() => {
    const rows = [...payload.leaderboard];
    const dir = lbSortAsc ? 1 : -1;
    const collator = new Intl.Collator("ru");
    rows.sort((a, b) => {
      switch (lbSortKey) {
        case "rank":
          return (a.rank - b.rank) * dir;
        case "film":
          return collator.compare(a.filmRu, b.filmRu) * dir;
        case "nominations":
          return (a.nominations - b.nominations) * dir;
        case "wins":
          return (a.wins - b.wins) * dir;
      }
    });
    return rows;
  }, [payload.leaderboard, lbSortKey, lbSortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function toggleLbSort(key: LbSortKey) {
    if (lbSortKey === key) setLbSortAsc(!lbSortAsc);
    else {
      setLbSortKey(key);
      setLbSortAsc(key === "rank" || key === "film");
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: payload.sourceUrl, refresh: true }),
      });
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  const sortIcon = (active: boolean, asc: boolean) =>
    active ? (asc ? " ▲" : " ▼") : "";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm text-slate-400 hover:text-amber-300">
              ← Все отчёты
            </Link>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                {payload.awardName}
              </span>{" "}
              {payload.year}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/kinopoisk.svg"
                alt="Кинопоиск"
                className="inline-block h-3.5 w-auto"
              />
              <span>·</span>
              Источник:{" "}
              <a
                href={payload.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 underline underline-offset-2 hover:text-amber-300"
              >
                {payload.sourceUrl.replace("https://www.", "")}
              </a>{" "}
              · данные от{" "}
              {new Date(fetchedAt).toLocaleString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              <button
                onClick={() => void refresh()}
                disabled={refreshing}
                className="ml-2 rounded-md border border-white/10 px-2 py-0.5 text-xs text-slate-400 transition hover:border-amber-400/40 hover:text-amber-300 disabled:opacity-50"
              >
                {refreshing ? "обновляем…" : "обновить"}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href={`/api/export/xlsx?slug=${slug}&year=${payload.year}`}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
            >
              ⬇ XLSX
            </a>
            <a
              href={`/api/export/md?slug=${slug}&year=${payload.year}`}
              className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-600"
            >
              ⬇ Markdown
            </a>
            <a
              href={`/api/export/html?slug=${slug}&year=${payload.year}`}
              className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              ⬇ HTML
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Категорий", value: stats.categories },
            { label: "Номинаций", value: stats.total },
            { label: "Наград вручено", value: stats.winners },
            { label: "Фильмов упомянуто", value: stats.films },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <div className="text-2xl font-bold text-amber-300">{s.value}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="sticky top-0 z-10 -mx-4 mt-6 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              {(
                [
                  ["categories", "По категориям"],
                  ["table", "Таблица"],
                  ...(payload.leaderboard.length > 0
                    ? ([["leaderboard", "Рейтинг фильмов"]] as const)
                    : []),
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                    tab === key
                      ? "bg-amber-500 text-slate-950"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab !== "leaderboard" && (
              <>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск: фильм, персона, категория…"
                  className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400/50"
                />
                <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={winnersOnly}
                    onChange={(e) => setWinnersOnly(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  только победители 🏆
                </label>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        {tab === "categories" && (
          <div className="mt-6 space-y-6">
            {filteredCategories.length === 0 && <Empty />}
            {filteredCategories.map((cat) => (
              <section
                key={cat.name}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
              >
                <h2 className="border-b border-white/10 bg-gradient-to-r from-amber-500/15 to-transparent px-5 py-3 text-lg font-semibold text-amber-300">
                  {cat.name}
                </h2>
                <div className="divide-y divide-white/5">
                  {cat.entries.map((e, i) => (
                    <EntryRow key={i} entry={e} awardYear={payload.year} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === "table" && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  {(
                    [
                      ["category", "Категория"],
                      ["status", "Статус"],
                      ["nominee", "Номинант"],
                      ["film", "Фильм"],
                    ] as [SortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className="cursor-pointer px-4 py-3 transition hover:text-amber-300"
                    >
                      {label}
                      {sortIcon(sortKey === key, sortAsc)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Ничего не найдено
                    </td>
                  </tr>
                )}
                {tableRows.map((r, i) => (
                  <tr
                    key={i}
                    className={
                      r.entry.winner
                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                        : "hover:bg-white/5"
                    }
                  >
                    <td className="px-4 py-3 text-slate-400">{r.category}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {r.entry.winner ? (
                        <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
                          🏆 Победитель
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                          Номинант
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EntryLinks entry={r.entry} kind="people" fallback={r.nominee} />
                      {r.entry.en && (
                        <div className="text-xs text-slate-500">{r.entry.en}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EntryLinks
                        entry={r.entry}
                        kind="films"
                        fallback="—"
                        awardYear={payload.year}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "leaderboard" && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  {(
                    [
                      ["rank", "№"],
                      ["film", "Фильм"],
                      ["nominations", "Номинации"],
                      ["wins", "Победы"],
                    ] as [LbSortKey, string][]
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleLbSort(key)}
                      className="cursor-pointer px-4 py-3 transition hover:text-amber-300"
                    >
                      {label}
                      {sortIcon(lbSortKey === key, lbSortAsc)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leaderboardRows.map((r) => (
                  <tr key={r.rank} className="hover:bg-white/5">
                    <td className="px-4 py-3 text-slate-500">{r.rank}</td>
                    <td className="px-4 py-3">
                      <a
                        href={r.filmUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-white hover:text-amber-300"
                      >
                        {r.filmRu}
                      </a>
                      {r.filmEn && (
                        <div className="text-xs text-slate-500">{r.filmEn}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{r.nominations}</td>
                    <td className="px-4 py-3 font-semibold text-amber-300">{r.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="mt-10 pb-6 text-center text-xs text-slate-600">
          Данные: Кинопоиск ({payload.fetchedVia}) · Отчёт носит информационный характер
        </footer>
      </div>
    </main>
  );
}

function EntryLinks({
  entry,
  kind,
  fallback,
  awardYear,
}: {
  entry: Entry;
  kind: "people" | "films";
  fallback: string;
  awardYear?: number;
}) {
  const links = kind === "people" ? entry.people : entry.films;
  if (links.length === 0) {
    if (kind === "people" && entry.films.length > 0) {
      // film-only category: show film as the nominee
      return (
        <EntryLinks entry={entry} kind="films" fallback={fallback} awardYear={awardYear} />
      );
    }
    return <span className="text-slate-400">{fallback}</span>;
  }
  return (
    <span>
      {links.map((l, i) => (
        <span key={i}>
          {i > 0 && ", "}
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="text-white underline decoration-white/20 underline-offset-2 hover:text-amber-300"
          >
            {l.text}
          </a>
          {kind === "films" && awardYear !== undefined && (
            <FilmAwardsIcon title={l.text} awardYear={awardYear} />
          )}
        </span>
      ))}
    </span>
  );
}

/** Small internal icon: opens our film awards search (film year ≈ award year - 1) */
function FilmAwardsIcon({ title, awardYear }: { title: string; awardYear: number }) {
  return (
    <a
      href={`/film?q=${encodeURIComponent(title)}&year=${awardYear - 1}`}
      title={`Все награды фильма «${title}»`}
      className="ml-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-amber-400/25 to-orange-500/25 align-[2px] text-[10px] no-underline transition hover:from-amber-400 hover:to-orange-500"
    >
      🏆
    </a>
  );
}

function EntryRow({ entry, awardYear }: { entry: Entry; awardYear: number }) {
  return (
    <div
      className={`flex items-start gap-4 px-5 py-3 ${
        entry.winner ? "bg-amber-500/10" : ""
      }`}
    >
      {entry.winner && entry.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={entry.posterUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="mt-0.5 h-16 w-11 shrink-0 rounded-md border-2 border-amber-400/70 object-cover"
        />
      ) : (
        <div className="mt-0.5 w-11 shrink-0 text-center text-lg">
          {entry.winner ? "🏆" : "·"}
        </div>
      )}
      <div className="min-w-0">
        <div
          className={`${
            entry.winner ? "font-semibold text-amber-200" : "text-slate-200"
          }`}
        >
          {entry.winner && entry.posterUrl && <span className="mr-1.5">🏆</span>}
          <MixedLinks entry={entry} awardYear={awardYear} />
        </div>
        {entry.en && <div className="mt-0.5 text-sm text-slate-500">{entry.en}</div>}
      </div>
    </div>
  );
}

/** Renders "Person, Person — Film, Film" with links, falling back to plain ru text */
function MixedLinks({ entry, awardYear }: { entry: Entry; awardYear: number }) {
  if (entry.people.length === 0 && entry.films.length === 0) {
    return <span>{entry.ru}</span>;
  }
  const linkCls =
    "underline decoration-white/20 underline-offset-2 hover:text-amber-300";
  return (
    <span>
      {entry.people.map((p, i) => (
        <span key={`p${i}`}>
          {i > 0 && ", "}
          <a href={p.url} target="_blank" rel="noreferrer" className={linkCls}>
            {p.text}
          </a>
        </span>
      ))}
      {entry.people.length > 0 && entry.films.length > 0 && " — "}
      {entry.films.map((f, i) => (
        <span key={`f${i}`}>
          {i > 0 && ", "}
          <a href={f.url} target="_blank" rel="noreferrer" className={linkCls}>
            {f.text}
          </a>
          <FilmAwardsIcon title={f.text} awardYear={awardYear} />
        </span>
      ))}
    </span>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-slate-500">
      Ничего не найдено — измените запрос или снимите фильтр
    </div>
  );
}
