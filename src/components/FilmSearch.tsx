"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Entry } from "@/lib/types";

interface PlanPage {
  slug: string;
  awardName: string;
  year: number;
  status: "cached" | "stale" | "missing" | "pending";
}

interface FilmMatch {
  awardSlug: string;
  awardName: string;
  awardYear: number;
  sourceUrl: string;
  category: string;
  entry: Entry;
}

type Phase = "idle" | "planning" | "scanning" | "searching" | "done" | "error";

const CONCURRENCY = 3;

export default function FilmSearch({
  initialQuery,
  initialYear,
  kpId,
}: {
  initialQuery: string;
  initialYear: number;
  kpId?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [currentPages, setCurrentPages] = useState<string[]>([]);
  const [matches, setMatches] = useState<FilmMatch[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [failedPages, setFailedPages] = useState<string[]>([]);
  const [coverage, setCoverage] = useState({ scanned: 0, planned: 0 });
  const [yearsLabel, setYearsLabel] = useState(String(initialYear));
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    setPhase("planning");
    setError(null);
    setMatches([]);
    setMissingCount(0);
    setFailedPages([]);
    try {
      // 1) plan
      const planRes = await fetch(`/api/search/plan?year=${initialYear}`);
      const planData = await planRes.json();
      if (!planRes.ok) throw new Error(planData.error ?? "Ошибка плана сканирования");
      const plan: PlanPage[] = planData.plan;
      const pending = plan.filter((p) => p.status === "pending" || p.status === "stale");
      const years = [...new Set(plan.map((p) => p.year))];
      setYearsLabel(
        years.length > 1
          ? `${years[0]}–${years[years.length - 1]}`
          : String(years[0] ?? initialYear),
      );
      setMissingCount(plan.filter((p) => p.status === "missing").length);

      // 2) scan pending pages with limited concurrency
      if (pending.length > 0) {
        setPhase("scanning");
        setProgress({ done: 0, total: pending.length });
        let idx = 0;
        let done = 0;
        const active = new Set<string>();

        const worker = async () => {
          while (idx < pending.length) {
            const page = pending[idx++];
            const label = `${page.awardName} ${page.year}`;
            active.add(label);
            setCurrentPages([...active]);
            try {
              const res = await fetch("/api/search/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  slug: page.slug,
                  year: page.year,
                  refresh: page.status === "stale",
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
              if (data.status === "missing") {
                setMissingCount((c) => c + 1);
              } else if (data.status === "error") {
                setFailedPages((items) => [...items, label]);
              }
            } catch {
              setFailedPages((items) => [...items, label]);
            }
            active.delete(label);
            done += 1;
            setProgress({ done, total: pending.length });
            setCurrentPages([...active]);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
        );
      }

      // 3) search
      setPhase("searching");
      const res = await fetch(
        `/api/search/results?q=${encodeURIComponent(initialQuery)}&year=${initialYear}` +
          (kpId ? `&kpId=${encodeURIComponent(kpId)}` : ""),
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
      setMatches(data.matches);
      setCoverage({ scanned: data.scannedPages, planned: data.plannedPages });
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Что-то пошло не так");
      setPhase("error");
    }
  }, [initialQuery, initialYear, kpId]);

  const exportParams =
    `q=${encodeURIComponent(initialQuery)}&year=${initialYear}` +
    (kpId ? `&kpId=${encodeURIComponent(kpId)}` : "");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);

  const wins = matches.filter((m) => m.entry.winner);
  const noms = matches.filter((m) => !m.entry.winner);

  // group matches by award edition
  const groups: { key: string; awardName: string; year: number; sourceUrl: string; items: FilmMatch[] }[] = [];
  for (const m of matches) {
    const key = `${m.awardSlug}:${m.awardYear}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, awardName: m.awardName, year: m.awardYear, sourceUrl: m.sourceUrl, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.entry.winner) - Number(a.entry.winner));
  }

  return (
    <div>
      {/* progress */}
      {(phase === "planning" || phase === "scanning" || phase === "searching") && (
        <div role="status" aria-live="polite" className="rounded-2xl border border-amber-200/20 bg-amber-500/10 p-6">
          <div className="flex items-center gap-3 text-amber-200">
            <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
            <span className="font-medium">
              {phase === "planning" && "Готовим план сканирования…"}
              {phase === "scanning" &&
                `Сканируем премии за ${yearsLabel}… (${progress.done} из ${progress.total})`}
              {phase === "searching" && "Ищем фильм в собранных данных…"}
            </span>
          </div>
          {phase === "scanning" && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                  style={{
                    width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
              {currentPages.length > 0 && (
                <div className="mt-3 text-sm text-slate-400">
                  Сейчас: {currentPages.join(" · ")}
                </div>
              )}
              <div className="mt-2 text-xs text-slate-500">
                Первое сканирование года может занять несколько минут — результаты
                кэшируются, повторные поиски по этим годам будут мгновенными.
              </div>
            </>
          )}
        </div>
      )}

      {phase === "error" && (
        <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-red-300">
          {error}
          <button
            onClick={() => void run()}
            className="ml-3 rounded-lg border border-red-300/40 px-3 py-1 text-sm hover:bg-red-500/20"
          >
            Повторить
          </button>
        </div>
      )}

      {phase === "done" && (
        <div>
          {/* export buttons */}
          {matches.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-slate-500">
                Сохранить результаты:
              </span>
              <a
                href={`/api/export/film/xlsx?${exportParams}`}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500"
              >
                ⬇ XLSX
              </a>
              <a
                href={`/api/export/film/md?${exportParams}`}
                className="rounded-xl bg-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-600"
              >
                ⬇ Markdown
              </a>
              <a
                href={`/api/export/film/html?${exportParams}`}
                className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
              >
                ⬇ HTML
              </a>
            </div>
          )}

          {/* stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
              <div className="text-2xl font-bold text-amber-300">{wins.length}</div>
              <div className="text-xs uppercase tracking-wider text-slate-400">
                Побед 🏆
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-bold text-white">{matches.length}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Номинаций всего
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-2xl font-bold text-white">{groups.length}</div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Премий / фестивалей
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
            Покрытие: актуально проверено {coverage.scanned} из {coverage.planned} страниц.
            {failedPages.length > 0 && (
              <span className="ml-1 text-red-300">
                Ошибок: {failedPages.length}; эти страницы не считаются отсутствующими.
              </span>
            )}
          </div>

          {matches.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-slate-400">
              <div className="text-3xl">🔍</div>
              <div className="mt-3">
                По запросу «{initialQuery}» в премиях за {yearsLabel}{" "}
                годов ничего не найдено.
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Попробуйте оригинальное название фильма, часть названия или другой год
                выпуска.
              </div>
            </div>
          )}

          {/* winners summary */}
          {wins.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-2xl border border-amber-400/30">
              <div className="bg-gradient-to-r from-amber-500/25 to-transparent px-5 py-3 font-semibold text-amber-300">
                🏆 Победы — {wins.length}
              </div>
              <div className="divide-y divide-white/5 bg-amber-500/5">
                {wins.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-baseline gap-x-2 px-5 py-2.5">
                    <span className="font-semibold text-amber-200">
                      {m.awardName} {m.awardYear}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-200">{m.category}</span>
                    {m.entry.people.length > 0 && (
                      <span className="text-sm text-slate-400">
                        — {m.entry.people.map((p) => p.text).join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* grouped detail */}
          <div className="mt-6 space-y-5">
            {groups.map((g) => {
              const gWins = g.items.filter((m) => m.entry.winner).length;
              return (
                <section
                  key={g.key}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-white/10 to-transparent px-5 py-3">
                    <h3 className="text-lg font-semibold text-white">
                      {g.awardName}{" "}
                      <span className="text-slate-400">{g.year}</span>
                      {gWins > 0 && (
                        <span className="ml-2 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                          🏆 {gWins} {plural(gWins, "победа", "победы", "побед")}
                        </span>
                      )}
                    </h3>
                    <Link
                      href={`/report/${g.key.split(":")[0]}/${g.year}`}
                      className="text-sm text-slate-400 underline underline-offset-2 hover:text-amber-300"
                    >
                      полный отчёт →
                    </Link>
                  </div>
                  <div className="divide-y divide-white/5">
                    {g.items.map((m, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 px-5 py-3 ${
                          m.entry.winner ? "bg-amber-500/10" : ""
                        }`}
                      >
                        <span className="mt-0.5 w-6 shrink-0 text-center">
                          {m.entry.winner ? "🏆" : "·"}
                        </span>
                        <div className="min-w-0">
                          <div
                            className={
                              m.entry.winner
                                ? "font-semibold text-amber-200"
                                : "text-slate-200"
                            }
                          >
                            {m.category}
                            {m.entry.winner && (
                              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">
                                ПОБЕДА
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-sm text-slate-400">
                            {m.entry.ru}
                            {m.entry.en && (
                              <span className="text-slate-600"> · {m.entry.en}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {missingCount > 0 && (
            <div className="mt-6 text-center text-xs text-slate-600">
              {missingCount} страниц премий за эти годы отсутствуют на Кинопоиске и были
              пропущены
            </div>
          )}
          {failedPages.length > 0 && (
            <div className="mt-2 text-center text-xs text-red-300/80">
              Не удалось проверить: {failedPages.join(" · ")}. Повторный поиск попробует
              их снова.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
