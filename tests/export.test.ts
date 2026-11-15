import assert from "node:assert/strict";
import test from "node:test";
import { buildReportHtml } from "../src/lib/html-export";
import { buildMarkdown, buildWorkbook } from "../src/lib/exporters";
import type { ReportPayload } from "../src/lib/types";

const payload: ReportPayload = {
  awardName: "Award <script>alert(1)</script>",
  year: 2026,
  sourceUrl: "https://www.kinopoisk.ru/awards/oscar/2026/",
  fetchedVia: "fixture",
  leaderboard: [],
  categories: [
    {
      name: "Best film",
      entries: [
        {
          ru: "Example",
          en: "Example",
          winner: true,
          people: [],
          films: [{ text: "Example", url: "https://www.kinopoisk.ru/film/1/" }],
        },
      ],
    },
  ],
};

test("HTML export escapes upstream text", () => {
  const html = buildReportHtml(payload);
  assert.match(html, /Award &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("Markdown and XLSX exports are generated", async () => {
  assert.match(buildMarkdown(payload), /Best film/);
  const workbook = await buildWorkbook(payload);
  assert.ok(workbook.byteLength > 1_000);
});
