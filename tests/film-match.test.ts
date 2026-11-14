import { describe, expect, it } from "vitest";
import { kpIdFromUrl, makeEntryMatcher, titleMatches, titleTokens } from "@/lib/film-match";
import type { Entry } from "@/lib/types";

const match = (text: string, query: string) => titleMatches(text, titleTokens(query));

function entry(over: Partial<Entry>): Entry {
  return { ru: "", en: "", people: [], films: [], winner: false, ...over };
}
const film = (text: string, id: number) => ({
  text,
  url: `https://www.kinopoisk.ru/film/${id}/`,
});

describe("titleMatches", () => {
  it("matches whole words only", () => {
    expect(match("Она", "она")).toBe(true);
    expect(match("Она сказала", "Она")).toBe(true);
    expect(match("Корона", "она")).toBe(false);
    expect(match("Мадонна", "она")).toBe(false);
    expect(match("Оппенгеймер", "гейм")).toBe(false);
  });

  it("ignores case, ё/е, quotes and punctuation", () => {
    expect(match("«Ёлки» — новогодняя комедия", "елки")).toBe(true);
    expect(match("WALL·E", "wall-e")).toBe(true);
    expect(match("Властелин колец: Возвращение короля", "властелин колец")).toBe(true);
  });

  it("requires the words to be adjacent and in order", () => {
    expect(match("Властелин колец", "колец властелин")).toBe(false);
    expect(match("Звёздные войны: Пробуждение силы", "звёздные силы")).toBe(false);
  });

  it("lets the last word be typed partially (4+ letters)", () => {
    expect(match("Оппенгеймер", "Оппенгейм")).toBe(true);
    expect(match("Бедные-несчастные", "бедные несч")).toBe(true);
    expect(match("Корона", "кор")).toBe(false);
  });

  it("never matches an empty query", () => {
    expect(match("Она", "  ")).toBe(false);
  });
});

describe("kpIdFromUrl", () => {
  it("reads film and series ids", () => {
    expect(kpIdFromUrl("https://www.kinopoisk.ru/film/301/")).toBe("301");
    expect(kpIdFromUrl("https://www.kinopoisk.ru/series/77044/")).toBe("77044");
    expect(kpIdFromUrl("https://www.kinopoisk.ru/name/123/")).toBeUndefined();
  });
});

describe("makeEntryMatcher", () => {
  const her = entry({ ru: "Она", en: "Her", films: [film("Она", 577488)] });
  const crown = entry({ ru: "Корона", en: "The Crown", films: [film("Корона", 893621)] });
  const remake = entry({ ru: "Она", en: "She", films: [film("Она", 111)] });
  const actor = entry({
    ru: "Хоакин Феникс — Она",
    en: "Joaquin Phoenix — Her",
    people: [{ text: "Хоакин Феникс", url: "https://www.kinopoisk.ru/name/10020/" }],
    films: [film("Она", 577488)],
  });
  const textOnly = entry({ ru: "Она", en: "Her" });

  it("by title: finds the film, not titles that merely contain the letters", () => {
    const isMatch = makeEntryMatcher({ title: "Она" });
    expect(isMatch(her)).toBe(true);
    expect(isMatch(actor)).toBe(true);
    expect(isMatch(crown)).toBe(false);
  });

  it("by title: matches the original title too", () => {
    expect(makeEntryMatcher({ title: "her" })(her)).toBe(true);
    expect(makeEntryMatcher({ title: "the crown" })(crown)).toBe(true);
  });

  it("by Kinopoisk id: distinguishes films with the same title", () => {
    const isMatch = makeEntryMatcher({ title: "Она", kpId: "577488" });
    expect(isMatch(her)).toBe(true);
    expect(isMatch(actor)).toBe(true);
    expect(isMatch(remake)).toBe(false);
  });

  it("by Kinopoisk id: entries without links still match by title", () => {
    const isMatch = makeEntryMatcher({ title: "Она", kpId: "577488" });
    expect(isMatch(textOnly)).toBe(true);
    expect(isMatch(entry({ ru: "Корона", en: "The Crown" }))).toBe(false);
  });
});
