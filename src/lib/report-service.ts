import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { fetchAndParseAward } from "./parser";
import type { ReportPayload } from "./types";

export interface StoredReport {
  payload: ReportPayload;
  fetchedAt: Date;
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
  return { payload: rows[0].payload, fetchedAt: rows[0].fetchedAt };
}

export async function getOrCreateReport(
  slug: string,
  year: number,
  refresh = false,
): Promise<StoredReport> {
  if (!refresh) {
    const existing = await getStoredReport(slug, year);
    if (existing) return existing;
  }

  const canonicalUrl = `https://www.kinopoisk.ru/awards/${slug}/${year}/`;
  let payload;
  try {
    payload = await fetchAndParseAward(slug, year);
  } catch (err) {
    // On explicit refresh keep serving the cached version if the source is down
    if (refresh) {
      const cached = await getStoredReport(slug, year);
      if (cached) return cached;
    }
    throw err;
  }

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
        payload,
        fetchedAt: sql`now()`,
      },
    });

  return { payload, fetchedAt: now };
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
