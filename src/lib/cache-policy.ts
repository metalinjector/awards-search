const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function reportTtlMs(year: number, now = new Date()): number {
  const currentYear = now.getFullYear();
  if (year >= currentYear) return 12 * HOUR;
  if (year === currentYear - 1) return 7 * DAY;
  return Number.POSITIVE_INFINITY;
}

export function isReportFresh(fetchedAt: Date, year: number, now = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < reportTtlMs(year, now);
}
