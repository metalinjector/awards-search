/* When cached data may still change at the source, and for how long we trust it. */

import type { ReportPayload } from "./types";

const HOUR = 60 * 60 * 1000;

/** Ceremony pending (nominees only): re-check twice a day */
export const PENDING_TTL_MS = 12 * HOUR;
/** Winners announced in the award's own year: allow for late corrections */
export const RECENT_TTL_MS = 7 * 24 * HOUR;

/**
 * Data about an award year is considered final once it was fetched in a
 * later calendar year — the ceremony is over and the page no longer changes.
 */
export function isSettled(awardYear: number, fetchedAt: Date): boolean {
  return fetchedAt.getUTCFullYear() > awardYear;
}

export function hasWinners(payload: ReportPayload): boolean {
  return payload.categories.some((c) => c.entries.some((e) => e.winner));
}

/** Should a cached Kinopoisk report be re-fetched? */
export function isReportStale(
  awardYear: number,
  fetchedAt: Date,
  withWinners: boolean,
  now = Date.now(),
): boolean {
  if (isSettled(awardYear, fetchedAt)) return false;
  const ttl = withWinners ? RECENT_TTL_MS : PENDING_TTL_MS;
  return now - fetchedAt.getTime() > ttl;
}

/** Should a cached IMDb event edition be re-fetched? */
export function isEventStale(
  eventYear: number,
  fetchedAt: Date,
  now = Date.now(),
): boolean {
  if (isSettled(eventYear, fetchedAt)) return false;
  return now - fetchedAt.getTime() > 24 * HOUR;
}
