/* TMDB (The Movie Database) integration.
 *
 * Important: TMDB's API does NOT provide awards data (well-known limitation,
 * confirmed by TMDB support forums and third-party projects on GitHub that
 * maintain awards datasets separately). So the flow is:
 *   TMDB search -> pick a title -> external_ids -> imdb_id -> our IMDb module.
 *
 * Auth: supports both v3 api_key (TMDB_API_KEY) and v4 read access token
 * (TMDB_ACCESS_TOKEN). Either one is enough.
 */

export interface TmdbSearchResult {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  originalTitle?: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  rating?: number;
  voteCount?: number;
}

export interface TmdbResolveResult {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  year?: number;
  imdbId: string | null;
}

const IMG = "https://image.tmdb.org/t/p/w185";

import { getSetting } from "./settings";

const TMDB_SETTING_KEY = "tmdb_api_key";

interface TmdbCredentials {
  v3Key?: string;
  v4Token?: string;
}

/** Key sources: env vars first, then the key saved via the UI (DB) */
async function getCredentials(): Promise<TmdbCredentials> {
  if (process.env.TMDB_ACCESS_TOKEN) return { v4Token: process.env.TMDB_ACCESS_TOKEN };
  if (process.env.TMDB_API_KEY) return { v3Key: process.env.TMDB_API_KEY };
  const saved = await getSetting(TMDB_SETTING_KEY);
  if (saved) {
    // v4 tokens are long JWTs starting with "ey", v3 keys are 32-char hex
    if (saved.startsWith("ey")) return { v4Token: saved };
    return { v3Key: saved };
  }
  return {};
}

export async function hasTmdbKey(): Promise<boolean> {
  const c = await getCredentials();
  return Boolean(c.v3Key || c.v4Token);
}

/** Validate a candidate key against the TMDB API (used when saving from the UI) */
export async function validateTmdbKey(candidate: string): Promise<boolean> {
  const trimmed = candidate.trim();
  if (trimmed.length < 10) return false;
  const isV4 = trimmed.startsWith("ey");
  const url = new URL("https://api.themoviedb.org/3/configuration");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (isV4) headers["Authorization"] = `Bearer ${trimmed}`;
  else url.searchParams.set("api_key", trimmed);
  try {
    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export { TMDB_SETTING_KEY };

async function tmdbGet(path: string, params: Record<string, string>): Promise<unknown> {
  const { v3Key, v4Token } = await getCredentials();
  if (!v3Key && !v4Token) {
    throw new Error("TMDB_KEY_MISSING");
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (v3Key && !v4Token) url.searchParams.set("api_key", v3Key);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (v4Token) headers["Authorization"] = `Bearer ${v4Token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 401) throw new Error("TMDB_KEY_INVALID");
    if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface RawMulti {
  id?: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
}

function yearOf(date?: string): number | undefined {
  if (!date) return undefined;
  const y = parseInt(date.slice(0, 4), 10);
  return Number.isFinite(y) ? y : undefined;
}

/** Search movies and TV shows on TMDB (russian titles included via language=ru-RU) */
export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
  const data = (await tmdbGet("/search/multi", {
    query,
    language: "ru-RU",
    include_adult: "false",
    page: "1",
  })) as { results?: RawMulti[] };

  return (data.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => ({
      id: r.id as number,
      mediaType: r.media_type as "movie" | "tv",
      title: (r.title ?? r.name ?? "").trim() || `#${r.id}`,
      originalTitle: r.original_title ?? r.original_name,
      year: yearOf(r.release_date ?? r.first_air_date),
      overview: r.overview,
      posterUrl: r.poster_path ? `${IMG}${r.poster_path}` : undefined,
      rating: r.vote_average,
      voteCount: r.vote_count,
    }))
    .slice(0, 12);
}

/** Resolve a TMDB title to its IMDb ID via /external_ids */
export async function resolveTmdbToImdb(
  tmdbId: number,
  mediaType: "movie" | "tv",
): Promise<TmdbResolveResult> {
  const [details, external] = await Promise.all([
    tmdbGet(`/${mediaType}/${tmdbId}`, { language: "ru-RU" }) as Promise<{
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
    }>,
    tmdbGet(`/${mediaType}/${tmdbId}/external_ids`, {}) as Promise<{
      imdb_id?: string | null;
    }>,
  ]);

  const imdbId =
    external.imdb_id && /^tt\d{4,12}$/.test(external.imdb_id)
      ? external.imdb_id
      : null;

  return {
    tmdbId,
    mediaType,
    title: (details.title ?? details.name ?? "").trim() || `#${tmdbId}`,
    year: yearOf(details.release_date ?? details.first_air_date),
    imdbId,
  };
}
