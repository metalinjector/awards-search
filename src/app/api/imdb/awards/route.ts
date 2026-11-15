import { NextRequest } from "next/server";
import { IMDB_TITLE_ID, jsonError } from "@/lib/api";
import { getImdbAwards } from "@/lib/imdb-service";
import { errorText } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!IMDB_TITLE_ID.test(id)) return jsonError("Некорректный IMDb ID", 400);
  const limited = rateLimited(req, "imdb");
  if (limited) return limited;
  try {
    const { payload, fetchedAt } = await getImdbAwards(id, refresh);
    return Response.json({ payload, fetchedAt: fetchedAt.toISOString() });
  } catch (err) {
    return jsonError(imdbErrorMessage(err, "Не удалось получить данные IMDb"), 502);
  }
}

function imdbErrorMessage(err: unknown, fallback: string): string {
  const raw = errorText(err);
  if (/HTTP 429/.test(raw)) {
    return "IMDb API временно ограничил запросы — подождите 10–20 секунд и повторите.";
  }
  if (/HTTP 404/.test(raw)) return "На IMDb нет такой записи.";
  return raw || fallback;
}
