import type { Entry } from "./types";

export function normalizeFilmTitle(value: string): string {
  return value
    .toLocaleLowerCase("ru")
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .replace(/[«»"“”'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function entryMatchesFilm(entry: Entry, query: string, kpId?: string): boolean {
  const normalizedQuery = normalizeFilmTitle(query);
  if (!normalizedQuery) return false;
  const normalizedKpId = /^\d{1,12}$/.test(kpId ?? "") ? kpId : undefined;
  if (
    normalizedKpId &&
    entry.films.some((film) =>
      new RegExp(`/(?:film|series)/${normalizedKpId}/`).test(film.url),
    )
  ) {
    return true;
  }
  const titleMatch = (value: string) => {
    const candidate = normalizeFilmTitle(value);
    return (
      candidate === normalizedQuery ||
      (!normalizedKpId && normalizedQuery.length >= 4 && candidate.includes(normalizedQuery))
    );
  };
  if (!normalizedKpId && entry.films.some((film) => titleMatch(film.text))) return true;
  if (!normalizedKpId && titleMatch(entry.en)) return true;
  return entry.people.length === 0 && entry.films.length === 0 && titleMatch(entry.ru);
}
