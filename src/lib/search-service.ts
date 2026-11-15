import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, scanMisses } from "@/db/schema";
import { AWARDS, scanYears } from "./awards";
import { makeEntryMatcher } from "./film-match";
import { isReportStale } from "./freshness";
import { errorText, log } from "./log";
import { AwardNotFoundError } from "./parser";
import { fetchAward, MISS_TTL_MS, recordMiss, saveReport } from "./report-service";
import type { Entry } from "./types";

export type PageStatus = "cached" | "missing" | "pending";

export interface PlanPage {
  slug: string;
  awardName: string;
  year: number;
  status: PageStatus;
}

/**
 * Whether a cached report already lists winners. Only evaluated for reports
 * fetched during (or before) their award year — later ones are final anyway.
 */
const hasWinnersSql = sql<boolean>`case
  when ${reports.year} < extract(year from ${reports.fetchedAt} at time zone 'UTC') then true
  else jsonb_path_exists(${reports.payload}, '$.categories[*].entries[*] ? (@.winner == true)')
end`;

/** Build the scan plan for a film year: which award/year pages are cached, missing, or need scanning */
export async function buildScanPlan(filmYear: number): Promise<PlanPage[]> {
  const years = scanYears(filmYear);
  if (years.length === 0) return []; // film year is in the future — nothing to scan

  const [cachedRows, missRows] = await Promise.all([
    db
      .select({
        slug: reports.awardSlug,
        year: reports.year,
        fetchedAt: reports.fetchedAt,
        hasWinners: hasWinnersSql,
      })
      .from(reports)
      .where(between(reports.year, years[0], years[years.length - 1])),
    db
      .select({
        slug: scanMisses.awardSlug,
        year: scanMisses.year,
        checkedAt: scanMisses.checkedAt,
      })
      .from(scanMisses)
      .where(between(scanMisses.year, years[0], years[years.length - 1])),
  ]);

  const now = Date.now();
  // reports that may have changed at the source go back into the scan queue
  const cached = new Set(
    cachedRows
      .filter((r) => !isReportStale(r.year, r.fetchedAt, r.hasWinners, now))
      .map((r) => `${r.slug}:${r.year}`),
  );
  const outdated = new Set(
    cachedRows
      .filter((r) => !cached.has(`${r.slug}:${r.year}`))
      .map((r) => `${r.slug}:${r.year}`),
  );
  const missed = new Set(
    missRows
      .filter((r) => now - r.checkedAt.getTime() < MISS_TTL_MS)
      .map((r) => `${r.slug}:${r.year}`),
  );

  const plan: PlanPage[] = [];
  for (const award of AWARDS) {
    for (const year of years) {
      const key = `${award.slug}:${year}`;
      plan.push({
        slug: award.slug,
        awardName: award.name,
        year,
        status: cached.has(key)
          ? "cached"
          : missed.has(key) && !outdated.has(key)
            ? "missing"
            : "pending",
      });
    }
  }
  return plan;
}

export type ScanStatus = "ok" | "missing" | "error";

/**
 * Scan a single award/year page.
 *  - "ok": a report is cached (fresh, or an older copy we kept because the refresh failed)
 *  - "missing": the page is known not to exist — remembered for 24h
 *  - "error": the source was unreachable; nothing is recorded, the next search retries
 */
export async function scanPage(slug: string, year: number): Promise<ScanStatus> {
  const existing = await db
    .select({ fetchedAt: reports.fetchedAt, hasWinners: hasWinnersSql })
    .from(reports)
    .where(and(eq(reports.awardSlug, slug), eq(reports.year, year)))
    .limit(1);
  if (
    existing.length > 0 &&
    !isReportStale(year, existing[0].fetchedAt, existing[0].hasWinners)
  ) {
    return "ok";
  }

  try {
    const payload = await fetchAward(slug, year, true);
    await saveReport(slug, year, payload);
    return "ok";
  } catch (err) {
    if (existing.length > 0) return "ok"; // keep serving the older copy
    if (err instanceof AwardNotFoundError) {
      await recordMiss(slug, year);
      return "missing";
    }
    log.warn("scan", "page not scanned", { slug, year, error: errorText(err) });
    return "error";
  }
}

export interface FilmMatch {
  awardSlug: string;
  awardName: string;
  awardYear: number;
  sourceUrl: string;
  category: string;
  entry: Entry;
}

export interface FilmSearchResult {
  matches: FilmMatch[];
  scannedAwards: number;
}

/**
 * Search cached reports of the 3-year window for a film.
 * With `kpId` (film picked from Kinopoisk) entries are matched by film id;
 * otherwise by title — as whole words, in Russian or the original.
 */
export async function searchFilm(
  query: string,
  filmYear: number,
  kpId?: string,
): Promise<FilmSearchResult> {
  const years = scanYears(filmYear);
  if (years.length === 0) return { matches: [], scannedAwards: 0 };
  const rows = await db
    .select()
    .from(reports)
    .where(inArray(reports.year, years));

  const isMatch = makeEntryMatcher({ title: query, kpId });
  const matches: FilmMatch[] = [];

  for (const row of rows) {
    for (const cat of row.payload.categories) {
      for (const e of cat.entries) {
        if (isMatch(e)) {
          matches.push({
            awardSlug: row.awardSlug,
            awardName: row.awardName,
            awardYear: row.year,
            sourceUrl: row.sourceUrl,
            category: cat.name,
            entry: e,
          });
        }
      }
    }
  }

  // winners first inside each award; awards sorted by year, then name
  matches.sort((a, b) => {
    if (a.awardYear !== b.awardYear) return a.awardYear - b.awardYear;
    const name = a.awardName.localeCompare(b.awardName, "ru");
    if (name !== 0) return name;
    return Number(b.entry.winner) - Number(a.entry.winner);
  });

  return { matches, scannedAwards: rows.length };
}
