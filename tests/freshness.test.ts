import { describe, expect, it } from "vitest";
import { hasWinners, isEventStale, isReportStale, isSettled } from "@/lib/freshness";
import type { ReportPayload } from "@/lib/types";

const HOUR = 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

describe("isSettled", () => {
  it("is final once fetched in a later year than the ceremony", () => {
    expect(isSettled(2024, at("2026-11-14T00:00:00Z"))).toBe(true);
    expect(isSettled(2026, at("2027-01-01T00:00:00Z"))).toBe(true);
    expect(isSettled(2026, at("2026-12-31T23:59:59Z"))).toBe(false);
    expect(isSettled(2027, at("2026-11-14T00:00:00Z"))).toBe(false);
  });
});

describe("isReportStale", () => {
  const fetched = at("2026-02-01T12:00:00Z");
  const later = (hours: number) => fetched.getTime() + hours * HOUR;

  it("re-checks a report without winners after 12 hours", () => {
    expect(isReportStale(2026, fetched, false, later(11))).toBe(false);
    expect(isReportStale(2026, fetched, false, later(13))).toBe(true);
  });

  it("re-checks a report with winners after a week", () => {
    expect(isReportStale(2026, fetched, true, later(6 * 24))).toBe(false);
    expect(isReportStale(2026, fetched, true, later(8 * 24))).toBe(true);
  });

  it("never re-checks a settled report", () => {
    expect(isReportStale(2020, fetched, false, later(10_000))).toBe(false);
  });
});

describe("isEventStale", () => {
  it("re-checks this year's ceremony daily, older ones never", () => {
    const fetched = at("2026-03-01T00:00:00Z");
    expect(isEventStale(2026, fetched, fetched.getTime() + 23 * HOUR)).toBe(false);
    expect(isEventStale(2026, fetched, fetched.getTime() + 25 * HOUR)).toBe(true);
    expect(isEventStale(2025, fetched, fetched.getTime() + 1000 * HOUR)).toBe(false);
  });
});

describe("hasWinners", () => {
  const payload = (winner: boolean): ReportPayload => ({
    awardName: "x",
    year: 2026,
    sourceUrl: "u",
    leaderboard: [],
    fetchedVia: "t",
    categories: [
      { name: "c", entries: [{ ru: "a", en: "", people: [], films: [], winner }] },
    ],
  });
  it("detects whether any entry won", () => {
    expect(hasWinners(payload(true))).toBe(true);
    expect(hasWinners(payload(false))).toBe(false);
  });
});
