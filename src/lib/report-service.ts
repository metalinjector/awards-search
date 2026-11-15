import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { fetchAndParseAward } from "./parser";
import type { ReportPayload } from "./types";
import { runExternalTask } from "./work-queue";
import { observeOperation } from "./metrics";
import { errorMessage, logEvent } from "./logger";
import { isReportFresh } from "./cache-policy";
export { isReportFresh, reportTtlMs } from "./cache-policy";

export interface StoredReport {
  payload: ReportPayload;
  fetchedAt: Date;
  isStale: boolean;
}

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
  return {
    payload: rows[0].payload,
    fetchedAt: rows[0].fetchedAt,
    isStale: !isReportFresh(rows[0].fetchedAt, year),
  };
}

async function refreshReport(slug: string, year: number): Promise<StoredReport> {
  return runExternalTask(`kinopoisk-report:${slug}:${year}`, () =>
    observeOperation("kinopoisk_report", async () => {
      const canonicalUrl = `https://www.kinopoisk.ru/awards/${slug}/${year}/`;
      const payload = await fetchAndParseAward(slug, year);
      const now = new Date();
      await db
        .insert(reports)
        .values({
          awardSlug: slug,
          year,
          awardName: payload.awardName,
          sourceUrl: canonicalUrl,
          payload,
          fetchedAt: now,
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
      logEvent("info", "report_refreshed", { slug, year });
      return { payload, fetchedAt: now, isStale: false };
    }),
  );
}

export async function getOrCreateReport(
  slug: string,
  year: number,
  refresh = false,
): Promise<StoredReport> {
  if (!refresh) {
    const existing = await getStoredReport(slug, year);
    if (existing && !existing.isStale) return existing;
    if (existing) {
      void refreshReport(slug, year).catch((error) =>
        logEvent("warn", "report_background_refresh_failed", {
          slug,
          year,
          error: errorMessage(error),
        }),
      );
      return existing;
    }
  }
  try {
    return await refreshReport(slug, year);
  } catch (err) {
    // On explicit refresh keep serving the cached version if the source is down
    if (refresh) {
      const cached = await getStoredReport(slug, year);
      if (cached) return cached;
    }
    throw err;
  }
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

export async function listAllReports() {
  return db
    .select({
      awardSlug: reports.awardSlug,
      year: reports.year,
      fetchedAt: reports.fetchedAt,
    })
    .from(reports)
    .orderBy(sql`${reports.year} desc`, reports.awardSlug);
}
