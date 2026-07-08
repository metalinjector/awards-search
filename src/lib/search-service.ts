import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, scanMisses } from "@/db/schema";
import { AWARDS, scanYears } from "./awards";
import { fetchAndParseAward } from "./parser";
import type { Entry } from "./types";

export type PageStatus = "cached" | "missing" | "pending";

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
      .select({ slug: reports.awardSlug, year: reports.year })
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

  const cached = new Set(cachedRows.map((r) => `${r.slug}:${r.year}`));
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
          ? "cached"
          : missed.has(key)
            ? "missing"
            : "pending",
      });
    }
  }
  return plan;
}

/** Scan a single award/year page: cache report on success, record a miss on failure */
export async function scanPage(
  slug: string,
  year: number,
): Promise<"ok" | "missing"> {
  // already cached?
  const existing = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.awardSlug, slug), eq(reports.year, year)))
    .limit(1);
  if (existing.length > 0) return "ok";

  const canonicalUrl = `https://www.kinopoisk.ru/awards/${slug}/${year}/`;
  try {
    const payload = await fetchAndParseAward(slug, year, { quick: true });
    await db
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
        set: { awardName: payload.awardName, payload, fetchedAt: sql`now()` },
      });
    return "ok";
  } catch {
    await db
      .insert(scanMisses)
      .values({ awardSlug: slug, year })
      .onConflictDoUpdate({
        target: [scanMisses.awardSlug, scanMisses.year],
        set: { checkedAt: sql`now()` },
      });
    return "missing";
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

/** Normalize for fuzzy matching: lowercase, ё→е, strip typographic quotes */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"“”'’]/g, "")
    .trim();
}

/** Search cached reports of the 3-year window for a film title (ru or original) */
export async function searchFilm(
  query: string,
  filmYear: number,
): Promise<FilmSearchResult> {
  const years = scanYears(filmYear);
  if (years.length === 0) return { matches: [], scannedAwards: 0 };
  const rows = await db
    .select()
    .from(reports)
    .where(inArray(reports.year, years));

  const q = norm(query);
  const matches: FilmMatch[] = [];

  for (const row of rows) {
    for (const cat of row.payload.categories) {
      for (const e of cat.entries) {
        const inFilms = e.films.some((f) => norm(f.text).includes(q));
        const inEn = norm(e.en).includes(q);
        const filmOnly =
          e.people.length === 0 &&
          e.films.length === 0 &&
          norm(e.ru).includes(q);
        if (inFilms || inEn || filmOnly) {
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
