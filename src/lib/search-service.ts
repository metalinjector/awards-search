import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, scanMisses } from "@/db/schema";
import { AWARDS, scanYears } from "./awards";
import { AwardSourceError, fetchAndParseAward } from "./parser";
import type { Entry } from "./types";
import { isReportFresh } from "./cache-policy";
import { runExternalTask } from "./work-queue";
import { observeOperation } from "./metrics";
import { errorMessage, logEvent } from "./logger";
import { entryMatchesFilm } from "./film-matching";

export type PageStatus = "cached" | "stale" | "missing" | "pending";

/** A recorded miss is trusted for 24h — award pages appear on Kinopoisk over time */
const MISS_TTL_MS = 1000 * 60 * 60 * 24;

export interface PlanPage {
  slug: string;
  awardName: string;
  year: number;
  status: PageStatus;
}

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

  const cached = new Map(
    cachedRows.map((r) => [`${r.slug}:${r.year}`, isReportFresh(r.fetchedAt, r.year)]),
  );
  const now = Date.now();
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
          ? cached.get(key)
            ? "cached"
            : "stale"
          : missed.has(key)
            ? "missing"
            : "pending",
      });
    }
  }
  return plan;
}

export interface ScanPageResult {
  status: "ok" | "missing" | "error";
  cached?: boolean;
  error?: string;
}

/** Scan a single award/year page; only confirmed absences are cached as misses. */
export async function scanPage(
  slug: string,
  year: number,
  refresh = false,
): Promise<ScanPageResult> {
  // already cached?
  const existing = await db
    .select({ id: reports.id, fetchedAt: reports.fetchedAt })
    .from(reports)
    .where(and(eq(reports.awardSlug, slug), eq(reports.year, year)))
    .limit(1);
  if (
    existing.length > 0 &&
    (!refresh || isReportFresh(existing[0].fetchedAt, year))
  ) {
    return { status: "ok", cached: true };
  }

  const canonicalUrl = `https://www.kinopoisk.ru/awards/${slug}/${year}/`;
  try {
    await runExternalTask(`kinopoisk-scan:${slug}:${year}`, () =>
      observeOperation("kinopoisk_scan", async () => {
        const payload = await fetchAndParseAward(slug, year, { quick: true });
        await db.transaction(async (tx) => {
          await tx
            .insert(reports)
            .values({
              awardSlug: slug,
              year,
              awardName: payload.awardName,
              sourceUrl: canonicalUrl,
              payload,
              fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [reports.awardSlug, reports.year],
              set: {
                awardName: payload.awardName,
                sourceUrl: canonicalUrl,
                payload,
                fetchedAt: sql`now()`,
              },
            });
          await tx
            .delete(scanMisses)
            .where(and(eq(scanMisses.awardSlug, slug), eq(scanMisses.year, year)));
        });
      }),
    );
    return { status: "ok" };
  } catch (error) {
    if (error instanceof AwardSourceError && error.code === "not_found") {
      await db
        .insert(scanMisses)
        .values({ awardSlug: slug, year })
        .onConflictDoUpdate({
          target: [scanMisses.awardSlug, scanMisses.year],
          set: { checkedAt: sql`now()` },
        });
      return { status: "missing" };
    }
    logEvent("warn", "award_scan_failed", {
      slug,
      year,
      error: errorMessage(error),
    });
    return {
      status: "error",
      cached: existing.length > 0,
      error:
        error instanceof AwardSourceError
          ? error.message
          : "Временная ошибка источника",
    };
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
  scannedPages: number;
  plannedPages: number;
}

/** Search cached reports of the 3-year window for a film title (ru or original) */
export async function searchFilm(
  query: string,
  filmYear: number,
  kpId?: string,
): Promise<FilmSearchResult> {
  const years = scanYears(filmYear);
  if (years.length === 0) return { matches: [], scannedPages: 0, plannedPages: 0 };
  const [allRows, missRows] = await Promise.all([
    db.select().from(reports).where(inArray(reports.year, years)),
    db
      .select({
        slug: scanMisses.awardSlug,
        year: scanMisses.year,
        checkedAt: scanMisses.checkedAt,
      })
      .from(scanMisses)
      .where(inArray(scanMisses.year, years)),
  ]);
  const supportedSlugs = new Set(AWARDS.map((award) => award.slug));
  const rows = allRows.filter((row) => supportedSlugs.has(row.awardSlug));

  const normalizedKpId = /^\d{1,12}$/.test(kpId ?? "") ? kpId : undefined;
  const matches: FilmMatch[] = [];

  for (const row of rows) {
    for (const cat of row.payload.categories) {
      for (const e of cat.entries) {
        if (entryMatchesFilm(e, query, normalizedKpId)) {
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

  const now = Date.now();
  const covered = new Set(
    rows
      .filter((row) => isReportFresh(row.fetchedAt, row.year))
      .map((row) => `${row.awardSlug}:${row.year}`),
  );
  for (const miss of missRows) {
    if (
      supportedSlugs.has(miss.slug) &&
      now - miss.checkedAt.getTime() < MISS_TTL_MS
    ) {
      covered.add(`${miss.slug}:${miss.year}`);
    }
  }

  return {
    matches,
    scannedPages: covered.size,
    plannedPages: AWARDS.length * years.length,
  };
}
