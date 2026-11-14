import { NextRequest } from "next/server";
import { IMDB_EVENT_ID, jsonError, parseYear } from "@/lib/api";
import { getImdbEvent } from "@/lib/imdb-service";
import { errorText } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (!IMDB_EVENT_ID.test(id) || year === null) {
    return jsonError("Нужны параметры id (evXXXXXXX) и year", 400);
  }
  const limited = rateLimited(req, "imdb");
  if (limited) return limited;
  try {
    return Response.json({ payload: await getImdbEvent(id, year) });
  } catch (err) {
    return jsonError(errorText(err) || "Не удалось получить данные события", 502);
  }
}
