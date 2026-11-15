// Parsers against saved copies of real Kinopoisk pages (tests/fixtures).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseKpSearchMarkdown } from "../src/lib/kp-suggest";
import { parseAwardMarkdown, parseAwardPage } from "../src/lib/parser";

const fixture = (name: string) =>
  fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");

test("HTML: Oscar 2024 — award name, categories, winner and leaderboard", () => {
  const report = parseAwardPage(fixture("award-oscar-2024.html"), "oscar", 2024, "kinopoisk.ru");
  assert.equal(report.awardName, "Оскар");
  assert.equal(report.year, 2024);
  assert.equal(report.categories.length, 3);
  const best = report.categories[0];
  assert.equal(best.name, "Лучший фильм");
  assert.equal(best.entries[0].winner, true);
  assert.equal(best.entries[0].en, "Oppenheimer");
  assert.deepEqual(
    best.entries[0].films.map((f) => ({ text: f.text, url: f.url })),
    [{ text: "Оппенгеймер", url: "https://www.kinopoisk.ru/film/4664634/" }],
  );
  assert.equal(best.entries.filter((e) => e.winner).length, 1);
  assert.ok(best.entries.length > 5);
  assert.equal(report.leaderboard[0].rank, 1);
  assert.equal(report.leaderboard[0].filmRu, "Оппенгеймер");
});

test("HTML: an empty Jina shell is not mistaken for an award page", () => {
  assert.throws(() =>
    parseAwardPage("<body><head></head><body></body></body>", "oscar", 2024, "x"),
  );
});

test("Markdown: Oscar 2024 gives the same data as the HTML render", () => {
  const report = parseAwardMarkdown(fixture("award-oscar-2024.md"), "oscar", 2024, "md");
  assert.equal(report.awardName, "Оскар");
  assert.ok(report.categories.length > 20);
  const best = report.categories[0];
  assert.equal(best.name, "Лучший фильм");
  assert.equal(best.entries[0].winner, true);
  assert.equal(best.entries[0].en, "Oppenheimer");
  assert.equal(best.entries[0].films[0]?.url, "https://www.kinopoisk.ru/film/4664634/");
  assert.ok(best.entries.some((e) => !e.winner && e.en === "Barbie"));
});

test("Markdown: festival layout (Cannes 2023) — icon categories, lists, posterless winners", () => {
  const report = parseAwardMarkdown(fixture("award-cannes-2023.md"), "cannes", 2023, "md");
  const category = (name: string) => {
    const found = report.categories.find((c) => c.name === name);
    if (!found) throw new Error(`category «${name}» is missing`);
    return found;
  };
  assert.equal(report.awardName, "Каннский кинофестиваль");
  assert.deepEqual(
    report.categories.slice(0, 3).map((c) => c.name),
    ["Золотая пальмовая ветвь", "Гран-при жюри", "Приз жюри"],
  );

  const palme = category("Золотая пальмовая ветвь");
  assert.equal(palme.entries[0].winner, true);
  assert.equal(palme.entries[0].ru, "Анатомия падения");
  assert.equal(palme.entries[0].en, "Anatomie d'une chute");
  assert.equal(palme.entries[0].films[0]?.url, "https://www.kinopoisk.ru/film/4910679/");
  assert.ok(palme.entries.filter((e) => !e.winner).length > 10);

  // "person — film" spelled like the site does
  assert.equal(category("Лучшая женская роль").entries[0].ru, "Мерве Диздар — О сухой траве");

  const students = category("Конкурс студенческих фильмов (Cinefondation)");
  assert.equal(students.entries.filter((e) => e.winner).length, 3);
  assert.ok(students.entries.map((e) => e.ru).includes("Дыра — 2-й приз"));
});

test("Kinopoisk search page: film cards", () => {
  const items = parseKpSearchMarkdown(fixture("kp-search.md"));
  assert.ok(items.length > 3);
  assert.equal(items[0].kpId, "301");
  assert.equal(items[0].title, "Матрица");
  assert.equal(items[0].year, 1999);
  assert.equal(items[0].originalTitle, "The Matrix");
});
