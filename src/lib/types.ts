export interface EntityLink {
  /** Display text (Russian) */
  text: string;
  /** Absolute kinopoisk URL */
  url: string;
}

export interface Entry {
  /** Full Russian line, e.g. "Майкл Б. Джордан — Грешники" */
  ru: string;
  /** Original (English) line, e.g. "Michael B. Jordan — Sinners" */
  en: string;
  /** People links (/name/...) */
  people: EntityLink[];
  /** Film links (/film/...) */
  films: EntityLink[];
  winner: boolean;
  posterUrl?: string;
}

export interface Category {
  name: string;
  entries: Entry[];
}

export interface LeaderboardRow {
  rank: number;
  filmRu: string;
  filmEn: string;
  filmUrl: string;
  nominations: number;
  wins: number;
}

export interface ReportPayload {
  awardName: string;
  year: number;
  sourceUrl: string;
  categories: Category[];
  leaderboard: LeaderboardRow[];
  fetchedVia: string;
}

export interface ReportMeta {
  awardSlug: string;
  year: number;
  awardName: string;
  fetchedAt: string;
}
