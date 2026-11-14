import { NextRequest } from "next/server";
import { jsonError, parseKpId, parseYear } from "@/lib/api";
import { searchFilm } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const year = parseYear(params.get("year"));
  if (q.length < 2) {
    return jsonError("Введите название фильма (минимум 2 символа)", 400);
  }
  if (year === null) return jsonError("Некорректный год", 400);
  return Response.json(await searchFilm(q, year, parseKpId(params.get("kp"))));
}
