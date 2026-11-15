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
