/* IMDb integration via the public suggestion API and imdb.com GraphQL. */

import { imdbGraphql, type GraphqlPageInfo } from "./imdb-graphql";

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

/** GET JSON with short retries for the IMDb suggestion endpoint. */
async function getJson(url: string, timeoutMs = 30_000): Promise<unknown> {
  let lastError: Error = new Error("request failed");
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
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

interface GraphqlName {
  id?: string;
  nameText?: { text?: string };
  primaryImage?: { url?: string };
  primaryProfessions?: Array<{ category?: { id?: string } }>;
}

interface GraphqlTitle {
  id?: string;
  titleText?: { text?: string };
  originalTitleText?: { text?: string };
  releaseYear?: { year?: number };
  titleType?: { id?: string };
  primaryImage?: { url?: string };
  genres?: { genres?: Array<{ text?: string }> };
  ratingsSummary?: { aggregateRating?: number; voteCount?: number };
  plot?: { plotText?: { plainText?: string } };
}

interface GraphqlNomination {
  id?: string;
  isWinner?: boolean;
  event?: { id?: string; name?: { text?: string } };
  eventEdition?: { year?: number };
  award?: { text?: string };
  category?: { text?: string };
  notes?: { plainText?: string };
  awardedEntities?: {
    awardNames?: Array<{ name?: GraphqlName }>;
    secondaryAwardNames?: Array<{ name?: GraphqlName }>;
  };
}

const GRAPHQL_NAME_FIELDS = `
  id
  nameText { text }
  primaryImage { url }
  primaryProfessions { category { id } }
`;

const TITLE_AWARDS_QUERY = `
query TitleAwards($id: ID!, $first: Int!, $after: ID) {
  title(id: $id) {
    id
    titleText { text }
    originalTitleText { text }
    releaseYear { year }
    primaryImage { url }
    genres { genres { text } }
    ratingsSummary { aggregateRating voteCount }
    plot { plotText { plainText } }
    principalCredits {
      category { id text }
      credits(limit: 10) { name { id nameText { text } } }
    }
    nominations(first: $first, after: $after) {
      total
      pageInfo { hasNextPage endCursor }
      edges { node {
        id
        isWinner
        event { id name { text } }
        eventEdition { year }
        award { text }
        category { text }
        notes { plainText }
        awardedEntities {
          ... on AwardedTitles {
            secondaryAwardNames { name { ${GRAPHQL_NAME_FIELDS} } }
          }
          ... on AwardedNames {
            awardNames { name { ${GRAPHQL_NAME_FIELDS} } }
          }
        }
      } }
    }
  }
}
`;

const NAME_DETAILS_QUERY = `
query NameDetails($id: ID!) {
  name(id: $id) {
    id
    nameText { text }
    primaryImage { url }
    primaryProfessions { category { id } }
    birthDate { date }
    bio { text { plainText } }
  }
}
`;

const NAME_CREDITS_QUERY = `
query NameCredits($id: ID!, $first: Int!, $after: ID) {
  name(id: $id) {
    credits(first: $first, after: $after) {
      total
      pageInfo { hasNextPage endCursor }
      edges { node {
        category { id }
        title {
          id
          titleText { text }
          releaseYear { year }
          titleType { id }
          ratingsSummary { aggregateRating }
          primaryImage { url }
        }
        ... on Cast { characters { name } }
      } }
    }
  }
}
`;

const TITLE_IMAGES_QUERY = `
query TitleImages($id: ID!, $first: Int!, $after: ID) {
  title(id: $id) {
    images(first: $first, after: $after) {
      total
      pageInfo { hasNextPage endCursor }
      edges { node { url width height type } }
    }
  }
}
`;

const OFFICIAL_TITLE_QUERY = `
query OfficialTitle($id: ID!) {
  title(id: $id) { id titleText { text } originalTitleText { text } }
}
`;

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

/** Normalize API dates to DD.MM.YYYY where all parts are available. */
function formatApiDate(
  d: { year?: number; month?: number; day?: number } | string | null | undefined,
): string | undefined {
  if (!d) return undefined;
  if (typeof d === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : d;
  }
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

  const details = await imdbGraphql<{
    name?: GraphqlName & {
      birthDate?: { date?: string };
      bio?: { text?: { plainText?: string } };
    };
  }>(NAME_DETAILS_QUERY, { id: nameId });
  const n = details.name;
  if (!n) throw new Error("Персона не найдена на IMDb");

  const person: ImdbNameInfo = {
    id: nameId,
    name: n.nameText?.text ?? nameId,
    imageUrl: n.primaryImage?.url,
    professions: (n.primaryProfessions ?? [])
      .map((item) => item.category?.id)
      .filter((id): id is string => Boolean(id)),
    biography: n.bio?.text?.plainText,
    birthDate: formatApiDate(n.birthDate?.date),
  };

  const filmography: ImdbFilmographyItem[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const data = await imdbGraphql<{
      name?: {
        credits?: {
          pageInfo?: GraphqlPageInfo;
          edges?: Array<{
            node?: {
              category?: { id?: string };
              title?: GraphqlTitle;
              characters?: Array<{ name?: string }>;
            };
          }>;
        };
      };
    }>(NAME_CREDITS_QUERY, { id: nameId, first: 100, after: pageToken ?? null });
    if (!data.name) throw new Error("Персона не найдена на IMDb");
    const connection = data.name.credits;
    for (const edge of connection?.edges ?? []) {
      const credit = edge.node;
      if (!credit) continue;
      const title = credit.title;
      const titleText = title?.titleText?.text;
      if (!title?.id || !titleText) continue;
      const category = credit.category?.id;
      const key = `${title.id}:${category ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      filmography.push({
        titleId: title.id,
        title: titleText,
        year: title.releaseYear?.year,
        type: title.titleType?.id,
        category,
        characters: (credit.characters ?? [])
          .map((character) => character.name)
          .filter((name): name is string => Boolean(name)),
        rating: title.ratingsSummary?.aggregateRating,
        imageUrl: title.primaryImage?.url,
      });
    }
    const nextToken = connection?.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor ?? undefined
      : undefined;
    if (!nextToken) break;
    if (seenTokens.has(nextToken)) {
      throw new Error("IMDb вернул повторяющийся токен фильмографии");
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
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
  const data = await imdbGraphql<{
    title?: {
      images?: {
        total?: number;
        pageInfo?: GraphqlPageInfo;
        edges?: Array<{
          node?: {
            url?: string;
            width?: number;
            height?: number;
            type?: string;
          };
        }>;
      };
    };
  }>(TITLE_IMAGES_QUERY, {
    id: imdbId,
    first: Math.min(50, Math.max(1, pageSize)),
    after: pageToken ?? null,
  });
  if (!data.title) throw new Error("Фильм не найден на IMDb");
  const images = data.title.images;
  return {
    images: (images?.edges ?? [])
      .map((edge) => edge.node)
      .filter((image): image is NonNullable<typeof image> & { url: string } =>
        Boolean(image?.url),
      )
      .map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
        type: image.type,
      })),
    totalCount: images?.total ?? 0,
    nextPageToken: images?.pageInfo?.hasNextPage
      ? images.pageInfo.endCursor ?? undefined
      : undefined,
  };
}

/** Official (original) title — used e.g. for the gallery ZIP file name */
export async function fetchOfficialTitle(imdbId: string): Promise<string> {
  if (!/^tt\d{4,12}$/.test(imdbId)) {
    throw new Error("Некорректный IMDb ID");
  }
  const data = await imdbGraphql<{ title?: GraphqlTitle }>(OFFICIAL_TITLE_QUERY, {
    id: imdbId,
  });
  const title = data.title;
  if (!title) throw new Error("Фильм не найден на IMDb");
  return title.originalTitleText?.text || title.titleText?.text || imdbId;
}

/** Fetch title info + ALL award nominations (recursively through pagination) */
export async function fetchImdbAwards(imdbId: string): Promise<ImdbAwardsPayload> {
  if (!/^tt\d{4,12}$/.test(imdbId)) {
    throw new Error("Некорректный IMDb ID");
  }

  interface PrincipalCredit {
    category?: { id?: string; text?: string };
    credits?: Array<{ name?: GraphqlName }>;
  }
  interface AwardsConnection {
    total?: number;
    pageInfo?: GraphqlPageInfo;
    edges?: Array<{ node?: GraphqlNomination }>;
  }

  const mapPrincipalPeople = (
    credits: PrincipalCredit[] | undefined,
    categoryMatches: (category: string) => boolean,
  ): ImdbPerson[] => {
    const seen = new Set<string>();
    const people: ImdbPerson[] = [];
    for (const group of credits ?? []) {
      const category = `${group.category?.id ?? ""} ${group.category?.text ?? ""}`
        .trim()
        .toLowerCase();
      if (!categoryMatches(category)) continue;
      for (const credit of group.credits ?? []) {
        const name = credit.name?.nameText?.text;
        if (!name) continue;
        const key = credit.name?.id ?? name;
        if (seen.has(key)) continue;
        seen.add(key);
        people.push({ id: credit.name?.id, name });
      }
    }
    return people;
  };

  const mapNominees = (nomination: GraphqlNomination): ImdbNominee[] => {
    const entities = nomination.awardedEntities;
    const candidates = [
      ...(entities?.awardNames ?? []),
      ...(entities?.secondaryAwardNames ?? []),
    ];
    const seen = new Set<string>();
    const people: ImdbNominee[] = [];
    for (const item of candidates) {
      const name = item.name?.nameText?.text;
      if (!name) continue;
      const key = item.name?.id ?? name;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({
        id: item.name?.id,
        name,
        imageUrl: item.name?.primaryImage?.url,
        professions: (item.name?.primaryProfessions ?? [])
          .map((profession) => profession.category?.id)
          .filter((id): id is string => Boolean(id)),
      });
    }
    return people;
  };

  let title: ImdbTitleInfo | undefined;
  const nominations: ImdbNomination[] = [];
  const seenNominations = new Set<string>();
  const seenTokens = new Set<string>();
  let reportedTotal = 0;
  let pageToken: string | undefined;

  for (let page = 0; page < 40; page++) {
    const data = await imdbGraphql<{
      title?: GraphqlTitle & {
        principalCredits?: PrincipalCredit[];
        nominations?: AwardsConnection;
      };
    }>(TITLE_AWARDS_QUERY, {
      id: imdbId,
      first: 100,
      after: pageToken ?? null,
    });
    const rawTitle = data.title;
    if (!rawTitle) throw new Error("Фильм не найден на IMDb");

    if (!title) {
      const principalCredits = rawTitle.principalCredits;
      title = {
        id: rawTitle.id ?? imdbId,
        title: rawTitle.titleText?.text ?? imdbId,
        originalTitle: rawTitle.originalTitleText?.text,
        year: rawTitle.releaseYear?.year,
        imageUrl: rawTitle.primaryImage?.url,
        genres: (rawTitle.genres?.genres ?? [])
          .map((genre) => genre.text)
          .filter((genre): genre is string => Boolean(genre)),
        rating: rawTitle.ratingsSummary?.aggregateRating,
        voteCount: rawTitle.ratingsSummary?.voteCount,
        plot: rawTitle.plot?.plotText?.plainText,
        directors: mapPrincipalPeople(principalCredits, (category) =>
          category.includes("director"),
        ),
        writers: mapPrincipalPeople(principalCredits, (category) =>
          category.includes("writer"),
        ),
        stars: mapPrincipalPeople(
          principalCredits,
          (category) => category.includes("star") || category.includes("cast"),
        ),
      };
    }

    const connection = rawTitle.nominations;
    reportedTotal = Math.max(reportedTotal, connection?.total ?? 0);
    for (const edge of connection?.edges ?? []) {
      const nomination = edge.node;
      if (!nomination) continue;
      const key = nomination.id ?? JSON.stringify(nomination);
      if (seenNominations.has(key)) continue;
      seenNominations.add(key);
      nominations.push({
        eventId: nomination.event?.id ?? "",
        eventName: nomination.event?.name?.text ?? "Unknown event",
        year: nomination.eventEdition?.year,
        awardText: nomination.award?.text,
        category: nomination.category?.text,
        isWinner: Boolean(nomination.isWinner),
        notes: nomination.notes?.plainText,
        nominees: mapNominees(nomination),
      });
    }

    const nextToken = connection?.pageInfo?.hasNextPage
      ? connection.pageInfo.endCursor ?? undefined
      : undefined;
    if (!nextToken) break;
    if (seenTokens.has(nextToken)) {
      throw new Error("IMDb вернул повторяющийся токен наград");
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }

  if (!title) throw new Error("Фильм не найден на IMDb");
  const winCount = nominations.filter((nomination) => nomination.isWinner).length;
  const total = Math.max(reportedTotal, nominations.length);
  return {
    title,
    stats: { winCount, nominationCount: Math.max(0, total - winCount) },
    nominations,
  };
}
