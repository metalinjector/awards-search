import { NextRequest } from "next/server";
import { IMDB_TITLE_ID, jsonError } from "@/lib/api";
import { fetchTitleImages } from "@/lib/imdb";
import { errorText } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  if (!IMDB_TITLE_ID.test(id)) return jsonError("Некорректный IMDb ID", 400);
  const limited = rateLimited(req, "imdbImages");
  if (limited) return limited;
  try {
    return Response.json(await fetchTitleImages(id, pageToken));
  } catch (err) {
    return jsonError(errorText(err) || "Не удалось получить галерею", 502);
  }
}
