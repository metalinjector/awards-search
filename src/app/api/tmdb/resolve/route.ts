import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { resolveTmdbToImdb } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (!Number.isFinite(id) || id <= 0 || (type !== "movie" && type !== "tv")) {
    return jsonError("Нужны параметры id (число) и type (movie|tv)", 400);
  }
  const limited = rateLimited(req, "search");
  if (limited) return limited;
  try {
    return Response.json(await resolveTmdbToImdb(id, type));
  } catch {
    return jsonError("Не удалось получить данные TMDB", 502);
  }
}
