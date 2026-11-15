import { NextRequest } from "next/server";
import { IMDB_NAME_ID, jsonError } from "@/lib/api";
import { getImdbPerson } from "@/lib/imdb-service";
import { errorText } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!IMDB_NAME_ID.test(id)) return jsonError("Некорректный IMDb ID персоны", 400);
  const limited = rateLimited(req, "imdb");
  if (limited) return limited;
  try {
    return Response.json(await getImdbPerson(id, refresh));
  } catch (err) {
    const raw = errorText(err);
    const message = /HTTP 429/.test(raw)
      ? "IMDb API временно ограничил запросы — подождите 10–20 секунд и обновите страницу."
      : /HTTP 404/.test(raw)
        ? "На IMDb нет такой персоны."
        : raw || "Не удалось получить данные персоны";
    return jsonError(message, 502);
  }
}
