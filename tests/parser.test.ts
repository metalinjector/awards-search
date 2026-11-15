import assert from "node:assert/strict";
import test from "node:test";
import { parseAwardPage, parseAwardUrl } from "../src/lib/parser";

test("parseAwardUrl accepts only canonical Kinopoisk award URLs", () => {
  assert.deepEqual(parseAwardUrl("kinopoisk.ru/awards/oscar/2026/"), {
    slug: "oscar",
    year: 2026,
    canonicalUrl: "https://www.kinopoisk.ru/awards/oscar/2026/",
  });
  assert.equal(parseAwardUrl("https://example.com/awards/oscar/2026"), null);
  assert.equal(parseAwardUrl("https://kinopoisk.ru/awards/oscar/26"), null);
});

test("parseAwardPage extracts a category, winner and nominee", () => {
  const html = `
    <h1 class="moviename-big"><a href="/awards/oscar/">Оскар</a></h1>
    <table id="itemList"><tbody>
      <tr><td class="news"><a name="best-film"></a><b>Лучший фильм</b></td></tr>
      <tr><td class="awardCol1"><img src="/poster.jpg"></td><td class="awardCol2">
        <a href="/film/123/">Победитель</a><span>Winner</span>
      </td></tr>
      <tr><td><ul class="trivia"><li><a href="/film/456/">Номинант</a><span>Nominee</span></li></ul></td></tr>
    </tbody></table>`;
  const report = parseAwardPage(html, "oscar", 2026, "fixture");
  assert.equal(report.awardName, "Оскар");
  assert.equal(report.categories.length, 1);
  assert.equal(report.categories[0].entries.length, 2);
  assert.equal(report.categories[0].entries[0].winner, true);
  assert.equal(report.categories[0].entries[1].winner, false);
});
