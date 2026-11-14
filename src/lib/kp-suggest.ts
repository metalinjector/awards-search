/* Kinopoisk film suggestions: search page fetched via Jina Reader, parsed from markdown */

import { BROWSER_UA, fetchText } from "./http";

export interface KpSuggestItem {
  kpId: string;
  title: string;
  originalTitle?: string;
  year?: number;
  director?: string;
  genres?: string;
  rating?: string;
  posterUrl: string;
}

const TITLE_LINE =
  /^\[([^\]]+)\]\(https:\/\/www\.kinopoisk\.ru\/film\/(\d+)\/[^)]*\)\s*(\d{4})?\s*$/;

/** Parse the Jina-markdown render of kinopoisk.ru search results */
export function parseKpSearchMarkdown(md: string): KpSuggestItem[] {
  const lines = md.split("\n").map((l) => l.trim());
  const items: KpSuggestItem[] = [];
  const seen = new Set<string>();
  let lastRating: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // standalone rating line preceding a film block, e.g. "8.5"
    if (/^\d{1,2}\.\d{1,3}$/.test(line)) {
      lastRating = line;
      continue;
    }

    const m = line.match(TITLE_LINE);
    if (!m) continue;
    const [, title, kpId, yearStr] = m;
    if (seen.has(kpId)) continue;
    seen.add(kpId);

    const item: KpSuggestItem = {
      kpId,
      title: title.trim(),
      year: yearStr ? parseInt(yearStr, 10) : undefined,
      rating: lastRating,
      posterUrl: `https://www.kinopoisk.ru/images/film_iphone/iphone360_${kpId}.jpg`,
    };
    lastRating = undefined;

    // info line: "The Matrix, 136 мин США... _реж. [Лана Вачовски](...)_"
    // or (RU films, no original title): "96 мин Россия, _реж. [Алексей Балабанов](...)_"
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const info = lines[j];
      if (!info) continue;
      if (TITLE_LINE.test(info) || info.startsWith("[![")) break;
      const dir = info.match(/реж\.\s*\[([^\]]+)\]/);
      if (dir) item.director = dir[1].trim();
      const orig = info.match(/^(.+?),\s*\d+\s*мин/);
      if (orig && !/^\d+\s*мин/.test(info)) {
        item.originalTitle = orig[1].trim();
      }
      if (dir || orig) {
        // genres live on the next line: "(фантастика, боевик) [actors]…"
        for (let k = j + 1; k < Math.min(j + 3, lines.length); k++) {
          const g = lines[k].match(/^\(([^)]+)\)/);
          if (g) {
            item.genres = g[1];
            break;
          }
          if (lines[k] && TITLE_LINE.test(lines[k])) break;
        }
        break;
      }
    }

    items.push(item);
    if (items.length >= 30) break;
  }
  return items;
}

/** Search films on Kinopoisk by title (via Jina Reader, ~10-30s) */
export async function searchKinopoiskFilms(
  query: string,
): Promise<KpSuggestItem[]> {
  const url =
    "https://r.jina.ai/https://www.kinopoisk.ru/index.php?kp_query=" +
    encodeURIComponent(query);
  const headers: Record<string, string> = { "User-Agent": BROWSER_UA };
  if (process.env.JINA_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const md = await fetchText(url, { headers, timeoutMs: 75_000, retries: 1 });
  return parseKpSearchMarkdown(md);
}
