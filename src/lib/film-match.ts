/* Matching a film against award entries. Pure — safe to unit-test and to use anywhere. */

import type { Entry } from "./types";

/** Lowercase words of a title: ё→е, punctuation and quotes dropped */
export function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The last word of the query may be typed partially if it is at least this long */
const MIN_PREFIX = 4;

/**
 * Does `text` contain the query as a sequence of whole words?
 * "она" matches "Она" and "Она сказала" but not "Корона";
 * a partially typed last word still matches ("оппенгейм" → "Оппенгеймер").
 */
export function titleMatches(text: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  const words = titleTokens(text);
  const last = queryTokens.length - 1;
  for (let start = 0; start + queryTokens.length <= words.length; start++) {
    let ok = true;
    for (let i = 0; i < queryTokens.length; i++) {
      const word = words[start + i];
      const q = queryTokens[i];
      const matches =
        word === q || (i === last && q.length >= MIN_PREFIX && word.startsWith(q));
      if (!matches) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Kinopoisk id from a /film/123/ or /series/123/ URL */
export function kpIdFromUrl(url: string): string | undefined {
  return url.match(/\/(?:film|series)\/(\d+)/)?.[1];
}

export interface FilmQuery {
  /** Film title as typed (Russian or original) */
  title: string;
  /** Kinopoisk film id — when known, linked entries are matched by it exactly */
  kpId?: string;
}

export function makeEntryMatcher(query: FilmQuery): (e: Entry) => boolean {
  const tokens = titleTokens(query.title);
  const { kpId } = query;

  return (e) => {
    if (kpId && e.films.length > 0) {
      // the entry links to specific films: the id decides, titles are irrelevant
      return e.films.some((f) => kpIdFromUrl(f.url) === kpId);
    }
    if (e.films.some((f) => titleMatches(f.text, tokens))) return true;
    if (titleMatches(e.en, tokens)) return true;
    // entry without any links: the Russian line is the film title itself
    return (
      e.people.length === 0 && e.films.length === 0 && titleMatches(e.ru, tokens)
    );
  };
}
