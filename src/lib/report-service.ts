import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, scanMisses } from "@/db/schema";
import { hasWinners, isReportStale } from "./freshness";
import { dedupe } from "./inflight";
import { errorText, log } from "./log";
import { AwardNotFoundError, fetchAndParseAward } from "./parser";
import type { ReportPayload } from "./types";

export interface StoredReport {
  payload: ReportPayload;
  fetchedAt: Date;
}

/** A recorded miss is trusted for 24h — award pages appear on Kinopoisk over time */
export const MISS_TTL_MS = 1000 * 60 * 60 * 24;

export async function getStoredReport(
  slug: string,
  year: number,
): Promise<StoredReport | null> {
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.awardSlug, slug), eq(reports.year, year)))
    .limit(1);
  if (rows.length === 0) return null;
  return { payload: rows[0].payload, fetchedAt: rows[0].fetchedAt };
}

/** Fetch + parse an award page; concurrent requests for the same page share one fetch */
export function fetchAward(
  slug: string,
  year: number,
  quick: boolean,
): Promise<ReportPayload> {
  return dedupe(`award:${slug}:${year}`, () =>
    fetchAndParseAward(slug, year, { quick }),
  );
}

export async function saveReport(
  slug: string,
  year: number,
  payload: ReportPayload,
): Promise<StoredReport> {
  const now = new Date();
  await db
    .insert(reports)
    .values({
      awardSlug: slug,
      year,
      awardName: payload.awardName,
      sourceUrl: payload.sourceUrl,
      payload,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: [reports.awardSlug, reports.year],
      set: { awardName: payload.awardName, payload, fetchedAt: sql`now()` },
    });
  return { payload, fetchedAt: now };
}

export async function recordMiss(slug: string, year: number): Promise<void> {
  await db
    .insert(scanMisses)
    .values({ awardSlug: slug, year })
    .onConflictDoUpdate({
      target: [scanMisses.awardSlug, scanMisses.year],
      set: { checkedAt: sql`now()` },
    });
}

async function hasFreshMiss(slug: string, year: number): Promise<boolean> {
  const rows = await db
    .select({ checkedAt: scanMisses.checkedAt })
    .from(scanMisses)
    .where(and(eq(scanMisses.awardSlug, slug), eq(scanMisses.year, year)))
    .limit(1);
  return rows.length > 0 && Date.now() - rows[0].checkedAt.getTime() < MISS_TTL_MS;
}

function isStale(report: StoredReport, year: number): boolean {
  return isReportStale(year, report.fetchedAt, hasWinners(report.payload));
}

/** Re-fetch a report without making anyone wait; failures keep the cached copy */
function refreshInBackground(slug: string, year: number): void {
  void fetchAward(slug, year, false)
    .then((payload) => saveReport(slug, year, payload))
    .catch((err) =>
      log.warn("report", "background refresh failed", {
        slug,
        year,
        error: errorText(err),
      }),
    );
}

/**
 * Cached report only — never blocks on Kinopoisk. A copy that may be outdated
 * (ceremony not over yet) is returned as is and refreshed in the background.
 */
export async function getCachedReport(
  slug: string,
  year: number,
): Promise<StoredReport | null> {
  const existing = await getStoredReport(slug, year);
  if (existing && isStale(existing, year)) refreshInBackground(slug, year);
  return existing;
}

export interface ReportOptions {
  /** Re-fetch even if a cached copy exists */
  refresh?: boolean;
  /** Skip pages recently found to be absent instead of fetching them again */
  useMissCache?: boolean;
}

export async function getOrCreateReport(
  slug: string,
  year: number,
  { refresh = false, useMissCache = false }: ReportOptions = {},
): Promise<StoredReport> {
  const existing = refresh
    ? await getStoredReport(slug, year)
    : await getCachedReport(slug, year);
  if (existing && !refresh) return existing;

  if (!existing && useMissCache && (await hasFreshMiss(slug, year))) {
    throw new AwardNotFoundError();
  }

  let payload: ReportPayload;
  try {
    payload = await fetchAward(slug, year, false);
  } catch (err) {
    // On explicit refresh keep serving the cached version if the source is down
    if (existing) return existing;
    if (err instanceof AwardNotFoundError) await recordMiss(slug, year);
    throw err;
  }

  return saveReport(slug, year, payload);
}

export async function listRecentReports(limit = 12) {
  return db
    .select({
      awardSlug: reports.awardSlug,
      year: reports.year,
      awardName: reports.awardName,
      fetchedAt: reports.fetchedAt,
    })
    .from(reports)
    .orderBy(sql`${reports.fetchedAt} desc`)
    .limit(limit);
}
