/* IMDb integration via the public suggestion API and api.imdbapi.dev */

export interface ImdbSearchResult {
  id: string;
  title: string;
  year?: number;
  type?: string;
  actors?: string;
  imageUrl?: string;
}

export interface ImdbNominee {
  id?: string;
  name: string;
  imageUrl?: string;
  professions?: string[];
}

export interface ImdbNomination {
  eventId: string;
  eventName: string;
  year?: number;
  awardText?: string;
  category?: string;
  isWinner: boolean;
  nominees: ImdbNominee[];
  notes?: string;
}

export interface ImdbPerson {
  id?: string;
  name: string;
}

export interface ImdbTitleInfo {
  id: string;
  title: string;
  originalTitle?: string;
  year?: number;
  imageUrl?: string;
  genres?: string[];
  rating?: number;
  voteCount?: number;
  plot?: string;
  directors?: ImdbPerson[];
  writers?: ImdbPerson[];
  stars?: ImdbPerson[];
}

export interface ImdbAwardsPayload {
  title: ImdbTitleInfo;
  stats: { nominationCount: number; winCount: number };
  nominations: ImdbNomination[];
}

const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with automatic retries on 429/5xx (api.imdbapi.dev rate-limits bursts) */
async function getJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  let lastError: Error = new Error("request failed");
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1)); // 2s,4s,8s,16s,32s
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: UA,
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue; // retry
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // network/timeout errors are retried too
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

/** Search titles via IMDb suggestion API */
export async function searchImdbTitles(query: string): Promise<ImdbSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const first = q[0].toLowerCase().replace(/[^a-z0-9]/, "x") || "x";
  const url = `https://v3.sg.media-imdb.com/suggestion/titles/${first}/${encodeURIComponent(q)}.json`;
  const data = (await getJson(url, 15_000)) as {
    d?: Array<{
      id?: string;
      l?: string;
      y?: number;
      q?: string;
      qid?: string;
      s?: string;
      i?: { imageUrl?: string };
    }>;
  };
  const items = data.d ?? [];
  return items
    .filter((it) => it.id?.startsWith("tt") && it.l)
    .map((it) => ({
      id: it.id as string,
      title: it.l as string,
      year: it.y,
      type: it.qid ?? it.q,
      actors: it.s,
      imageUrl: it.i?.imageUrl,
    }));
}

const TYPE_LABELS: Record<string, string> = {
  movie: "Фильм",
  tvSeries: "Сериал",
  tvMovie: "ТВ-фильм",
  tvMiniSeries: "Мини-сериал",
  short: "Короткометражка",
  video: "Видео",
  videoGame: "Игра",
  tvSpecial: "ТВ-шоу",
  podcastSeries: "Подкаст",
  musicVideo: "Клип",
};

export function imdbTypeLabel(type?: string): string {
  if (!type) return "";
  return TYPE_LABELS[type] ?? type;
}

interface ApiNomination {
  nominees?: Array<{
    id?: string;
    displayName?: string;
    primaryImage?: { url?: string };
    primaryProfessions?: string[];
  }>;
  event?: { id?: string; name?: string };
  year?: number;
  text?: string;
  category?: string;
  isWinner?: boolean;
  notes?: string;
}

export interface ImdbNameInfo {
  id: string;
  name: string;
  imageUrl?: string;
  professions?: string[];
  biography?: string;
  birthDate?: string;
}

export interface ImdbFilmographyItem {
  titleId: string;
  title: string;
  year?: number;
  type?: string;
  category?: string;
  characters?: string[];
  rating?: number;
  imageUrl?: string;
}

export interface ImdbPersonPayload {
  person: ImdbNameInfo;
  filmography: ImdbFilmographyItem[];
}

/** API returns dates as {year, month, day} objects — normalize to a display string */
function formatApiDate(
  d: { year?: number; month?: number; day?: number } | string | null | undefined,
): string | undefined {
  if (!d) return undefined;
  if (typeof d === "string") return d;
  const parts: string[] = [];
  if (d.day) parts.push(String(d.day).padStart(2, "0"));
  if (d.month) parts.push(String(d.month).padStart(2, "0"));
  if (d.year) parts.push(String(d.year));
  return parts.length > 0 ? parts.join(".") : undefined;
}

/** Fetch person info + full filmography (paginated) */
export async function fetchImdbPerson(nameId: string): Promise<ImdbPersonPayload> {
  if (!/^nm\d{4,12}$/.test(nameId)) {
    throw new Error("Некорректный IMDb ID персоны");
  }

  const n = (await getJson(`https://api.imdbapi.dev/names/${nameId}`)) as {
    displayName?: string;
    primaryImage?: { url?: string };
    primaryProfessions?: string[];
    biography?: string;
    birthDate?: { year?: number; month?: number; day?: number } | string | null;
  };
  const person: ImdbNameInfo = {
    id: nameId,
    name: n.displayName ?? nameId,
    imageUrl: n.primaryImage?.url,
    professions: n.primaryProfessions,
    biography: n.biography,
    birthDate: formatApiDate(n.birthDate),
  };

  const filmography: ImdbFilmographyItem[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    if (page > 0) await sleep(1000); // stay under the API burst limit
    const url =
      `https://api.imdbapi.dev/names/${nameId}/filmography?pageSize=50` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    interface FilmPage {
      credits?: Array<{
        title?: {
          id?: string;
          primaryTitle?: string;
          startYear?: number;
          type?: string;
          rating?: { aggregateRating?: number };
          primaryImage?: { url?: string };
        };
        category?: string;
        characters?: string[];
      }>;
      nextPageToken?: string;
    }
    let data: FilmPage;
    try {
      data = (await getJson(url)) as FilmPage;
    } catch (err) {
      // Rate-limited mid-pagination: return what we already have
      // (better a partial filmography than an error screen).
      if (filmography.length > 0) break;
      throw err;
    }
    for (const c of data.credits ?? []) {
      const t = c.title;
      if (!t?.id || !t.primaryTitle) continue;
      const key = `${t.id}:${c.category ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filmography.push({
        titleId: t.id,
        title: t.primaryTitle,
        year: t.startYear,
        type: t.type,
        category: c.category,
        characters: c.characters,
        rating: t.rating?.aggregateRating,
        imageUrl: t.primaryImage?.url,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  filmography.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return { person, filmography };
}

/* ---------- Title image gallery ---------- */

export interface GalleryImage {
  url: string;
  width?: number;
  height?: number;
  type?: string;
}

export interface GalleryPage {
  images: GalleryImage[];
  totalCount: number;
  nextPageToken?: string;
}

/** One page of the title's image gallery (posters, stills, events…) */
export async function fetchTitleImages(
  imdbId: string,
  pageToken?: string,
  pageSize = 50,
): Promise<GalleryPage> {
  if (!/^tt\d{4,12}$/.test(imdbId)) {
    throw new Error("Некорректный IMDb ID");
  }
  const url =
    `https://api.imdbapi.dev/titles/${imdbId}/images?pageSize=${pageSize}` +
    (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
  const d = (await getJson(url)) as {
    images?: { url?: string; width?: number; height?: number; type?: string }[];
    totalCount?: number;
    nextPageToken?: string;
  };
  return {
    images: (d.images ?? [])
      .filter((i) => i.url)
      .map((i) => ({
        url: i.url as string,
        width: i.width,
        height: i.height,
        type: i.type,
      })),
    totalCount: d.totalCount ?? 0,
    nextPageToken: d.nextPageToken,
  };
}

/** Official (original) title — used e.g. for the gallery ZIP file name */
export async function fetchOfficialTitle(imdbId: string): Promise<string> {
  if (!/^tt\d{4,12}$/.test(imdbId)) {
    throw new Error("Некорректный IMDb ID");
  }
  const t = (await getJson(`https://api.imdbapi.dev/titles/${imdbId}`)) as {
    primaryTitle?: string;
    originalTitle?: string;
  };
  return t.originalTitle || t.primaryTitle || imdbId;
}

/** Fetch title info + ALL award nominations (recursively through pagination) */
export async function fetchImdbAwards(imdbId: string): Promise<ImdbAwardsPayload> {
  if (!/^tt\d{4,12}$/.test(imdbId)) {
    throw new Error("Некорректный IMDb ID");
  }

  // title info
  interface ApiPerson {
    id?: string;
    displayName?: string;
  }
  const t = (await getJson(`https://api.imdbapi.dev/titles/${imdbId}`)) as {
    id?: string;
    primaryTitle?: string;
    originalTitle?: string;
    startYear?: number;
    primaryImage?: { url?: string };
    genres?: string[];
    rating?: { aggregateRating?: number; voteCount?: number };
    plot?: string;
    directors?: ApiPerson[];
    writers?: ApiPerson[];
    stars?: ApiPerson[];
  };
  const mapPeople = (arr?: ApiPerson[]): ImdbPerson[] =>
    (arr ?? [])
      .filter((p) => p.displayName)
      .map((p) => ({ id: p.id, name: p.displayName as string }));
  const title: ImdbTitleInfo = {
    id: imdbId,
    title: t.primaryTitle ?? imdbId,
    originalTitle: t.originalTitle,
    year: t.startYear,
    imageUrl: t.primaryImage?.url,
    genres: t.genres,
    rating: t.rating?.aggregateRating,
    voteCount: t.rating?.voteCount,
    plot: t.plot,
    directors: mapPeople(t.directors),
    writers: mapPeople(t.writers),
    stars: mapPeople(t.stars),
  };

  // all nominations with pagination (max ~40 pages as a safety cap)
  const nominations: ImdbNomination[] = [];
  let stats = { nominationCount: 0, winCount: 0 };
  let pageToken: string | undefined;

  for (let page = 0; page < 40; page++) {
    if (page > 0) await sleep(1000); // stay under the API burst limit
    const url =
      `https://api.imdbapi.dev/titles/${imdbId}/awardNominations?pageSize=50` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    interface AwardsPage {
      stats?: { nominationCount?: number; winCount?: number };
      awardNominations?: ApiNomination[];
      nextPageToken?: string;
    }
    let data: AwardsPage;
    try {
      data = (await getJson(url)) as AwardsPage;
    } catch (err) {
      // Rate-limited mid-pagination: keep the partial nomination list
      if (nominations.length > 0) break;
      throw err;
    }
    if (data.stats) {
      stats = {
        nominationCount: data.stats.nominationCount ?? 0,
        winCount: data.stats.winCount ?? 0,
      };
    }
    for (const n of data.awardNominations ?? []) {
      nominations.push({
        eventId: n.event?.id ?? "",
        eventName: n.event?.name ?? "Unknown event",
        year: n.year,
        awardText: n.text,
        category: n.category,
        isWinner: Boolean(n.isWinner),
        notes: n.notes,
        nominees: (n.nominees ?? [])
          .filter((p) => p.displayName)
          .map((p) => ({
            id: p.id,
            name: p.displayName as string,
            imageUrl: p.primaryImage?.url,
            professions: p.primaryProfessions,
          })),
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return { title, stats, nominations };
}
