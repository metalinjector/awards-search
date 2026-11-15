import assert from "node:assert/strict";
import test from "node:test";
import { entryMatchesFilm, normalizeFilmTitle } from "../src/lib/film-matching";
import type { Entry } from "../src/lib/types";

const entry: Entry = {
  ru: "Оппенгеймер",
  en: "Oppenheimer",
  winner: true,
  people: [],
  films: [{ text: "Оппенгеймер", url: "https://www.kinopoisk.ru/film/4664634/" }],
};

test("normalization handles Russian spelling and quotes", () => {
  assert.equal(normalizeFilmTitle(" «Всё ещё здесь» "), "все еще здесь");
});

test("matching prefers the stable Kinopoisk identifier", () => {
  assert.equal(entryMatchesFilm(entry, "wrong title", "4664634"), true);
  assert.equal(entryMatchesFilm(entry, "Оппенгеймер", "999"), false);
});

test("very short fuzzy queries do not produce substring matches", () => {
  assert.equal(entryMatchesFilm(entry, "пен"), false);
  assert.equal(entryMatchesFilm(entry, "Оппен"), true);
});
