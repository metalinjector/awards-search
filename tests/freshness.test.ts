import assert from "node:assert/strict";
import test from "node:test";
import { isReportFresh, reportTtlMs } from "../src/lib/cache-policy";

test("current reports expire quickly while historic reports remain stable", () => {
  const now = new Date("2026-08-31T12:00:00Z");
  assert.equal(reportTtlMs(2026, now), 12 * 60 * 60 * 1000);
  assert.equal(reportTtlMs(2025, now), 7 * 24 * 60 * 60 * 1000);
  assert.equal(reportTtlMs(2024, now), Number.POSITIVE_INFINITY);
  assert.equal(isReportFresh(new Date("2026-08-31T06:00:00Z"), 2026, now), true);
  assert.equal(isReportFresh(new Date("2026-08-30T06:00:00Z"), 2026, now), false);
});

test("a report fetched after its award year is final and never re-fetched", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  // fetched in 2026 for the 2025 ceremony — settled, even months later
  assert.equal(isReportFresh(new Date("2026-01-20T00:00:00Z"), 2025, now), true);
  // fetched during 2025 for the 2025 ceremony — still subject to the 7-day TTL
  assert.equal(isReportFresh(new Date("2025-12-01T00:00:00Z"), 2025, now), false);
  // the current year keeps the short TTL
  assert.equal(isReportFresh(new Date("2026-11-15T06:00:00Z"), 2026, now), true);
  assert.equal(isReportFresh(new Date("2026-11-14T06:00:00Z"), 2026, now), false);
});
