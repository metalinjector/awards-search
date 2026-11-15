import assert from "node:assert/strict";
import test from "node:test";
import { parsePositiveId, parseYear } from "../src/lib/validation";

test("year parser requires an exact supported four-digit year", () => {
  assert.equal(parseYear("2024"), 2024);
  assert.equal(parseYear("2024abc"), null);
  assert.equal(parseYear("024"), null);
  assert.equal(parseYear("2200"), null);
});

test("positive ID parser never truncates suffixes", () => {
  assert.equal(parsePositiveId("12345"), 12345);
  assert.equal(parsePositiveId("123x"), null);
  assert.equal(parsePositiveId("0"), null);
});
