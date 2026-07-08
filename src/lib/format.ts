import type { Entry, ReportPayload } from "./types";

/** People part of an entry (or the Russian line if it's a film-only entry) */
export function entryNominee(e: Entry): string {
  if (e.people.length > 0) return e.people.map((p) => p.text).join(", ");
  return e.ru;
}

/** Film(s) of an entry */
export function entryFilms(e: Entry): string {
  return e.films.map((f) => f.text).join(", ");
}

export function reportStats(payload: ReportPayload) {
  let winners = 0;
  let total = 0;
  const films = new Set<string>();
  for (const cat of payload.categories) {
    for (const e of cat.entries) {
      total += 1;
      if (e.winner) winners += 1;
      for (const f of e.films) films.add(f.url || f.text);
      if (e.films.length === 0 && e.people.length === 0) films.add(e.ru);
    }
  }
  return {
    categories: payload.categories.length,
    winners,
    total,
    films: films.size,
  };
}

export function reportFileBase(payload: ReportPayload, slug: string): string {
  return `${slug}-${payload.year}`;
}
