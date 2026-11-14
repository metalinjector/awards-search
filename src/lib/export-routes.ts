/* Parameter parsing + data loading shared by the /api/export/* routes.
 * Each loader returns either the data to export or a ready error response. */

import type { NextRequest } from "next/server";
import { AWARD_SLUG, IMDB_TITLE_ID, jsonError, parseKpId, parseYear, safeFileName } from "./api";
import type { ImdbAwardsPayload } from "./imdb";
import { getImdbAwards } from "./imdb-service";
import { errorText, log } from "./log";
import { getStoredReport } from "./report-service";
import { searchFilm, type FilmMatch } from "./search-service";
import type { ReportPayload } from "./types";

export async function loadReportExport(
  req: NextRequest,
): Promise<{ payload: ReportPayload; fileBase: string } | Response> {
  const slug = (req.nextUrl.searchParams.get("slug") ?? "").toLowerCase();
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (!AWARD_SLUG.test(slug) || year === null) {
    return jsonError("Нужны параметры slug и year", 400);
  }
  const stored = await getStoredReport(slug, year);
  if (!stored) return jsonError("Отчёт не найден", 404);
  return { payload: stored.payload, fileBase: `${slug}-${year}` };
}

export async function loadFilmExport(
  req: NextRequest,
): Promise<
  { q: string; year: number; matches: FilmMatch[]; fileBase: string } | Response
> {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const year = parseYear(params.get("year"));
  if (q.length < 2 || year === null) {
    return jsonError("Нужны параметры q (название) и year (год фильма)", 400);
  }
  const { matches } = await searchFilm(q, year, parseKpId(params.get("kp")));
  return { q, year, matches, fileBase: `${safeFileName(q, "film")}-${year}-awards` };
}

export async function loadImdbExport(
  req: NextRequest,
): Promise<{ payload: ImdbAwardsPayload; fileBase: string } | Response> {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!IMDB_TITLE_ID.test(id)) return jsonError("Некорректный IMDb ID", 400);
  try {
    const { payload } = await getImdbAwards(id);
    return {
      payload,
      fileBase: `${safeFileName(payload.title.title, "title")}-imdb-awards`,
    };
  } catch (err) {
    log.warn("export", "imdb awards unavailable", { id, error: errorText(err) });
    return jsonError("Не удалось получить данные IMDb — попробуйте ещё раз", 502);
  }
}
