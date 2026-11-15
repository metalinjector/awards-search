import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type {
  Category,
  Entry,
  EntityLink,
  LeaderboardRow,
  ReportPayload,
} from "./types";

const KP_BASE = "https://www.kinopoisk.ru";

export interface ParsedAwardUrl {
  slug: string;
  year: number;
  canonicalUrl: string;
}

export type AwardSourceErrorCode =
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "parse";

export class AwardSourceError extends Error {
  constructor(
    readonly code: AwardSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AwardSourceError";
  }
}

/** Accepts URLs like https://www.kinopoisk.ru/awards/oscar/2026/ (with or without protocol/www/trailing slash) */
export function parseAwardUrl(input: string): ParsedAwardUrl | null {
  const trimmed = input.trim();
  const m = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?kinopoisk\.ru\/awards\/([a-z0-9_\-]+)\/(\d{4})\/?(?:[?#].*)?$/i,
  );
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const year = parseInt(m[2], 10);
  if (year < 1900 || year > 2100) return null;
  return {
    slug,
    year,
    canonicalUrl: `${KP_BASE}/awards/${slug}/${year}/`,
  };
}

function absoluteUrl(href: string | undefined): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return KP_BASE + (href.startsWith("/") ? href : "/" + href);
}

function cleanText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type FetchTextResult =
  | { ok: true; text: string; status: number }
  | { ok: false; kind: "timeout" | "network" | "http"; status?: number };

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<FetchTextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, kind: "http", status: res.status };
    return { ok: true, text: await res.text(), status: res.status };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, kind: "timeout" };
    }
    return { ok: false, kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeAwardPage(html: string | null): html is string {
  return (
    !!html &&
    (html.includes("awardCol2") || html.includes("itemList")) &&
    html.includes("awards")
  );
}

function looksLikeMissingPage(text: string): boolean {
  return /(?:target url returned error\s*404|ошибка\s*404|страниц[аы]\s+не\s+найден[аы]?|page not found)/i.test(
    text,
  );
}

function looksLikeRateLimit(text: string): boolean {
  return /(?:too many requests|rate limit(?:ed| exceeded)?|лимит\s+запросов|ошибка\s*429)/i.test(
    text,
  );
}

/**
 * Fetch the award page and parse it into a payload.
 * 1) Jina Reader HTML render → HTML parser
 * 2) Jina Reader markdown render → markdown parser (some pages render empty as HTML)
 * 3) Wayback Machine snapshot → HTML parser
 */
export async function fetchAndParseAward(
  slug: string,
  year: number,
  opts: { quick?: boolean } = {},
): Promise<ReportPayload> {
  const canonicalUrl = `${KP_BASE}/awards/${slug}/${year}/`;

  // 1) HTML via Jina
  let htmlError: AwardSourceError | null = null;
  try {
    const { html, via } = await fetchAwardHtml(canonicalUrl, opts);
    return parseAwardPage(html, slug, year, via);
  } catch (error) {
    htmlError =
      error instanceof AwardSourceError
        ? error
        : new AwardSourceError("parse", "Не удалось разобрать страницу премии.");
  }

  // 2) Markdown via Jina
  const mdHeaders: Record<string, string> = {};
  if (process.env.JINA_API_KEY) {
    mdHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const mdResult = await fetchWithTimeout(
    `https://r.jina.ai/${canonicalUrl}`,
    mdHeaders,
    opts.quick ? 55_000 : 90_000,
  );
  if (mdResult.ok && mdResult.text.includes("Номинанты:")) {
    try {
      return parseAwardMarkdown(
        mdResult.text,
        slug,
        year,
        "kinopoisk.ru (markdown)",
      );
    } catch (error) {
      throw error instanceof AwardSourceError
        ? error
        : new AwardSourceError("parse", "Не удалось разобрать данные премии.");
    }
  }
  if (mdResult.ok && looksLikeRateLimit(mdResult.text)) {
    throw new AwardSourceError(
      "rate_limited",
      "Источник временно ограничил запросы. Повторите попытку позже.",
    );
  }
  if (mdResult.ok && looksLikeMissingPage(mdResult.text)) {
    throw new AwardSourceError(
      "not_found",
      "На Кинопоиске нет данных этой премии за указанный год.",
    );
  }
  if (mdResult.ok) {
    if (htmlError && htmlError.code !== "not_found") throw htmlError;
    throw new AwardSourceError(
      "parse",
      "Источник ответил, но формат страницы не распознан. Данные не помечены отсутствующими.",
    );
  }
  if (mdResult.kind === "http" && mdResult.status === 429) {
    throw new AwardSourceError(
      "rate_limited",
      "Источник временно ограничил запросы. Повторите попытку позже.",
    );
  }
  if (htmlError && htmlError.code !== "not_found") throw htmlError;
  throw new AwardSourceError(
    mdResult.kind === "timeout" ? "timeout" : "upstream",
    "Источник временно недоступен. Повторите попытку через минуту.",
  );
}

/**
 * Fetch rendered HTML for the award page.
 * Primary: Jina Reader (renders JS + bypasses bot protection).
 * Fallback: Wayback Machine snapshot.
 */
export async function fetchAwardHtml(
  canonicalUrl: string,
  opts: { quick?: boolean } = {},
): Promise<{ html: string; via: string }> {
  let sawReadableResponse = false;
  let sawRateLimit = false;
  let sawTimeout = false;
  let sawTransientFailure = false;
  let sawConfirmedMissing = false;
  let sawUnrecognizedResponse = false;
  // 1) Jina Reader
  const jinaHeaders: Record<string, string> = {
    "X-Return-Format": "html",
  };
  if (process.env.JINA_API_KEY) {
    jinaHeaders["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const attempts = opts.quick ? 1 : 2;
  const timeout = opts.quick ? 55_000 : 90_000;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const headers =
      attempt === 0
        ? jinaHeaders
        : { ...jinaHeaders, "X-No-Cache": "true", "X-Timeout": "30" };
    const result = await fetchWithTimeout(
      `https://r.jina.ai/${canonicalUrl}`,
      headers,
      timeout,
    );
    if (result.ok) {
      sawReadableResponse = true;
      if (looksLikeAwardPage(result.text)) {
        return { html: result.text, via: "kinopoisk.ru" };
      }
      sawRateLimit ||= looksLikeRateLimit(result.text);
      sawConfirmedMissing ||= looksLikeMissingPage(result.text);
      sawUnrecognizedResponse ||=
        !looksLikeRateLimit(result.text) && !looksLikeMissingPage(result.text);
    } else {
      sawRateLimit ||= result.kind === "http" && result.status === 429;
      sawTimeout ||= result.kind === "timeout";
      sawTransientFailure ||=
        result.kind === "network" ||
        (result.kind === "http" && (result.status ?? 500) >= 500);
    }
  }

  // 2) Wayback Machine fallback
  const availability = await fetchWithTimeout(
    `https://archive.org/wayback/available?url=${encodeURIComponent(
      canonicalUrl.replace(/^https?:\/\//, ""),
    )}`,
    {},
    20_000,
  );
  if (availability.ok) {
    try {
      const data = JSON.parse(availability.text) as {
        archived_snapshots?: { closest?: { url?: string; timestamp?: string } };
      };
      const snap = data.archived_snapshots?.closest;
      if (snap?.url && snap.timestamp) {
        const rawUrl = snap.url.replace(
          /\/web\/(\d+)\//,
          (_s, ts: string) => `/web/${ts}id_/`,
        );
        const archived = await fetchWithTimeout(rawUrl, {}, 60_000);
        if (archived.ok) {
          sawReadableResponse = true;
          sawRateLimit ||= looksLikeRateLimit(archived.text);
          sawConfirmedMissing ||= looksLikeMissingPage(archived.text);
          sawUnrecognizedResponse ||=
            !looksLikeRateLimit(archived.text) && !looksLikeMissingPage(archived.text);
        } else {
          sawTimeout ||= archived.kind === "timeout";
          sawTransientFailure = true;
        }
        if (archived.ok && looksLikeAwardPage(archived.text)) {
          return {
            html: archived.text,
            via: `web.archive.org (снимок ${snap.timestamp.slice(0, 8)})`,
          };
        }
      }
    } catch {
      sawTransientFailure = true;
    }
  } else {
    sawRateLimit ||= availability.kind === "http" && availability.status === 429;
    sawTimeout ||= availability.kind === "timeout";
    sawTransientFailure = true;
  }
  if (sawRateLimit) {
    throw new AwardSourceError(
      "rate_limited",
      "Источник временно ограничил запросы. Повторите попытку позже.",
    );
  }
  if (sawTimeout && !sawReadableResponse) {
    throw new AwardSourceError("timeout", "Источник не ответил вовремя.");
  }
  if (sawTransientFailure && !sawReadableResponse) {
    throw new AwardSourceError("upstream", "Источник временно недоступен.");
  }
  if (sawConfirmedMissing && !sawUnrecognizedResponse) {
    throw new AwardSourceError(
      "not_found",
      "На Кинопоиске нет данных этой премии за указанный год.",
    );
  }
  throw new AwardSourceError(
    "parse",
    "Источник ответил, но формат страницы не распознан. Данные не помечены отсутствующими.",
  );
}

function extractEntry(
  $: cheerio.CheerioAPI,
  c: cheerio.Cheerio<Element>,
  winner: boolean,
  posterUrl?: string,
): Entry | null {
  const clone = c.clone();
  clone.find("span, director, ul, .poster").remove();
  const ru = cleanText(clone.text());
  const en = cleanText(c.find("span").first().text());

  const people: EntityLink[] = [];
  const films: EntityLink[] = [];
  c.find("a").each((_i, a) => {
    const $a = $(a);
    const href = $a.attr("href") ?? "";
    const text = cleanText($a.text());
    if (!text) return;
    if (/\/name\/\d+/.test(href)) {
      people.push({ text, url: absoluteUrl(href) });
    } else if (/\/film\/\d+/.test(href) || /\/series\/\d+/.test(href)) {
      films.push({ text, url: absoluteUrl(href) });
    }
  });

  if (!ru && people.length === 0 && films.length === 0) return null;

  return {
    ru: ru || en,
    en,
    people,
    films,
    winner,
    ...(posterUrl ? { posterUrl } : {}),
  };
}

export function parseAwardPage(
  html: string,
  slug: string,
  year: number,
  via: string,
): ReportPayload {
  const $ = cheerio.load(html);

  // Award name from breadcrumbs: Награды / Оскар / 2026
  let awardName = "";
  $("h1.moviename-big a").each((_i, a) => {
    const href = $(a).attr("href") ?? "";
    if (new RegExp(`/awards/${slug}/?$`).test(href)) {
      awardName = cleanText($(a).text());
    }
  });
  if (!awardName) {
    awardName = slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  // Leaderboard: "Главные фильмы года"
  const leaderboard: LeaderboardRow[] = [];
  $("td.news").each((_i, td) => {
    const $td = $(td);
    if (!/Главные фильмы года/i.test($td.text())) return;
    const table = $td.closest("table");
    table.find("tr").each((_j, tr) => {
      const cells = $(tr).find("td");
      if (cells.length !== 4) return;
      const rankText = cleanText($(cells[0]).text()).replace(/\.$/, "");
      const rank = parseInt(rankText, 10);
      if (!Number.isFinite(rank)) return;
      const filmCell = $(cells[1]);
      const link = filmCell.find("a").first();
      const filmRu = cleanText(link.text());
      const filmUrl = absoluteUrl(link.attr("href"));
      const cellClone = filmCell.clone();
      cellClone.find("a").remove();
      const filmEn = cleanText(cellClone.text());
      const nominations = parseInt(cleanText($(cells[2]).text()), 10) || 0;
      const wins = parseInt(cleanText($(cells[3]).text()), 10) || 0;
      if (filmRu) {
        leaderboard.push({ rank, filmRu, filmEn, filmUrl, nominations, wins });
      }
    });
  });

  // Categories with winners and nominees
  const categories: Category[] = [];
  let current: Category | null = null;

  const rows = $("#itemList > tbody > tr, #itemList > tr");
  rows.each((_i, tr) => {
    const $tr = $(tr);

    // Category header row
    const header = $tr.find("td.news a[name]").first();
    if (header.length > 0) {
      const name = cleanText($tr.find("td.news b").first().text());
      if (name) {
        current = { name, entries: [] };
        categories.push(current);
      }
      return;
    }

    // Winner row
    const winnerCell = $tr.find("td.awardCol2").first();
    if (winnerCell.length > 0 && current) {
      const poster = $tr.find("td.awardCol1 img").attr("src");
      const entry = extractEntry(
        $,
        winnerCell,
        true,
        poster ? absoluteUrl(poster) : undefined,
      );
      if (entry) current.entries.push(entry);
      return;
    }

    // Nominee list row
    const lis = $tr.find("ul.trivia > li");
    if (lis.length > 0 && current) {
      const cat = current;
      lis.each((_j, li) => {
        const entry = extractEntry($, $(li), false);
        if (entry) cat.entries.push(entry);
      });
    }
  });

  const nonEmpty = categories.filter((c) => c.entries.length > 0);
  if (nonEmpty.length === 0) {
    throw new AwardSourceError(
      "not_found",
      "Страница загружена, но данные о номинациях не найдены. Возможно, для этого года и премии данных ещё нет.",
    );
  }

  return {
    awardName,
    year,
    sourceUrl: `${KP_BASE}/awards/${slug}/${year}/`,
    categories: nonEmpty,
    leaderboard:
      leaderboard.length > 0 ? leaderboard : synthesizeLeaderboard(nonEmpty),
    fetchedVia: via,
  };
}

/* ------------------------- markdown fallback ------------------------- */

const LINK_RE = /\[([^\]]*)\]\((https?:[^)\s]+)\)/g;

function parseLinksFromChunk(chunk: string): {
  ru: string;
  en: string;
  people: EntityLink[];
  films: EntityLink[];
} {
  const people: EntityLink[] = [];
  const films: EntityLink[] = [];
  let lastEnd = 0;
  for (const m of chunk.matchAll(LINK_RE)) {
    const text = cleanText(m[1]);
    const url = m[2];
    if (!text) continue;
    if (/\/name\/\d+/.test(url)) people.push({ text, url });
    else if (/\/film\/\d+/.test(url) || /\/series\/\d+/.test(url))
      films.push({ text, url });
    lastEnd = (m.index ?? 0) + m[0].length;
  }
  const en = mdText(chunk.slice(lastEnd));
  const ru = mdText(chunk.slice(0, lastEnd).replace(LINK_RE, "$1"));
  return { ru, en, people, films };
}

/** "Номинанты:", "Участники конкурсной программы:", "Остальные участники …:" */
const NOMINEE_LIST_RE = /^(?:Номинанты|(?:Остальные )?[Уу]частники[^:*\[]*):\s*/;

/** Markdown glues "Name—Film"; the site (and the HTML parser) shows "Name — Film" */
function mdText(s: string): string {
  return cleanText(s.replace(/\*+/g, "").replace(/\s*—\s*/g, " — "));
}

/** Parse Jina Reader markdown output of an award page */
export function parseAwardMarkdown(
  md: string,
  slug: string,
  year: number,
  via: string,
): ReportPayload {
  const lines = md.split("\n");
  const categories: Category[] = [];
  let current: Category | null = null;
  let pendingWinner: Entry | null = null;

  const flushWinnerEn = (en: string) => {
    if (pendingWinner && !pendingWinner.en && en) {
      pendingWinner.en = cleanText(en);
    }
    pendingWinner = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Category: [](url)**Category Name** — festival pages put an icon in front
    const catMatch = line.match(
      /^(?:!\[[^\]]*\]\([^)]*\))?\[\]\([^)]*\)\*\*(.+?)\*\*/,
    );
    if (catMatch) {
      pendingWinner = null;
      current = { name: cleanText(catMatch[1]), entries: [] };
      categories.push(current);
      continue;
    }

    // Winner: ![Image N: title](poster)**[Name](url)...**
    // (festival pages also list winners without a poster: **[Name](url)—2-й приз**)
    if ((line.startsWith("![") || line.startsWith("**[")) && current) {
      const imgMatch = line.match(/^!\[[^\]]*\]\((https?:[^)\s]+)\)/);
      const posterUrl = imgMatch?.[1];
      const rest = line.replace(/^!\[[^\]]*\]\([^)]*\)/, "");
      const parsed = parseLinksFromChunk(rest);
      if (parsed.ru || parsed.people.length > 0 || parsed.films.length > 0) {
        const entry: Entry = {
          // the whole line as text, e.g. "Мерве Диздар — О сухой траве", "Дыра — 2-й приз"
          ru: mdText(rest.replace(LINK_RE, "$1")),
          en: "",
          people: parsed.people,
          films: parsed.films,
          winner: true,
          ...(posterUrl ? { posterUrl } : {}),
        };
        current.entries.push(entry);
        pendingWinner = entry;
      }
      continue;
    }

    // Nominees: "Номинанты: * [X](url) OrigX * ..."
    // (festivals: "Остальные участники конкурсной программы: * ...")
    const listMatch = line.match(NOMINEE_LIST_RE);
    if (listMatch && current) {
      pendingWinner = null;
      const body = line.slice(listMatch[0].length);
      const items = body.split(/\s\*\s+/).filter((s) => s.trim());
      for (const item of items) {
        const parsed = parseLinksFromChunk(item.replace(/^\*\s*/, ""));
        if (!parsed.ru && parsed.people.length === 0 && parsed.films.length === 0)
          continue;
        current.entries.push({
          ru: parsed.ru || parsed.en,
          en: parsed.en,
          people: parsed.people,
          films: parsed.films,
          winner: false,
        });
      }
      continue;
    }

    // Plain line right after a winner block = original (en) title
    if (pendingWinner && !line.startsWith("[") && !line.startsWith("!")) {
      flushWinnerEn(line);
      continue;
    }
  }

  const nonEmpty = categories.filter((c) => c.entries.length > 0);
  if (nonEmpty.length === 0) {
    throw new AwardSourceError(
      "not_found",
      "Markdown-версия страницы не содержит номинаций.",
    );
  }

  return {
    awardName: awardTitleFallback(slug),
    year,
    sourceUrl: `${KP_BASE}/awards/${slug}/${year}/`,
    categories: nonEmpty,
    leaderboard: synthesizeLeaderboard(nonEmpty),
    fetchedVia: via,
  };
}

function awardTitleFallback(slug: string): string {
  const KNOWN: Record<string, string> = {
    oscar: "Оскар",
    golden_globes: "Золотой глобус",
    bafta: "BAFTA",
    cannes: "Каннский кинофестиваль",
    venice: "Венецианский кинофестиваль",
    berlin: "Берлинский кинофестиваль",
    cesar: "Сезар",
    efa: "Европейская киноакадемия",
    emmy: "Эмми",
    goya: "Гойя",
    sag: "Гильдия киноактёров (SAG)",
    saturn: "Сатурн",
    mtv: "MTV",
    razzie: "Золотая малина",
    sundance: "Сандэнс",
    karlovy_vary: "Карловы Вары",
    sanseb: "Сан-Себастьян",
    miff: "ММКФ",
    kinotavr: "Кинотавр",
    nika: "Ника",
    orel: "Золотой орёл",
    georges: "Жорж",
    mtv_russia: "MTV Россия",
    asian: "Азиатская киноакадемия",
  };
  return (
    KNOWN[slug] ??
    slug.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
  );
}

/** Build the "main films" leaderboard from nomination counts when the page doesn't provide one */
function synthesizeLeaderboard(categories: Category[]): LeaderboardRow[] {
  const byFilm = new Map<
    string,
    { filmRu: string; filmUrl: string; nominations: number; wins: number }
  >();
  for (const cat of categories) {
    // count each film once per category entry
    for (const e of cat.entries) {
      for (const f of e.films) {
        const key = f.url || f.text;
        const rec =
          byFilm.get(key) ??
          ({ filmRu: f.text, filmUrl: f.url, nominations: 0, wins: 0 } as const);
        const next = {
          filmRu: rec.filmRu,
          filmUrl: rec.filmUrl,
          nominations: rec.nominations + 1,
          wins: rec.wins + (e.winner ? 1 : 0),
        };
        byFilm.set(key, next);
      }
    }
  }
  const rows = [...byFilm.values()]
    .filter((r) => r.nominations >= 2)
    .sort((a, b) => b.nominations - a.nominations || b.wins - a.wins)
    .slice(0, 5)
    .map((r, i) => ({
      rank: i + 1,
      filmRu: r.filmRu,
      filmEn: "",
      filmUrl: r.filmUrl,
      nominations: r.nominations,
      wins: r.wins,
    }));
  return rows;
}
