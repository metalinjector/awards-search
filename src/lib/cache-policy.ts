const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How long a report fetched before its award year was over can be trusted */
export function reportTtlMs(year: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  if (year >= currentYear) return 12 * HOUR;
  if (year === currentYear - 1) return 7 * DAY;
  return Number.POSITIVE_INFINITY;
}

/**
 * A report fetched in a later calendar year than the award year is final:
 * the ceremony is over and the page no longer changes.
 */
export function isReportSettled(fetchedAt: Date, year: number): boolean {
  return fetchedAt.getUTCFullYear() > year;
}

export function isReportFresh(fetchedAt: Date, year: number, now = new Date()): boolean {
  if (isReportSettled(fetchedAt, year)) return true;
  return now.getTime() - fetchedAt.getTime() < reportTtlMs(year, now);
}
