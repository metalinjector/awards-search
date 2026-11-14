import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { errorText } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";
import { hasTmdbKey, searchTmdb } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const keyProblem = (code: string) =>
  Response.json({ error: code, configured: false }, { status: 503 });

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 200) {
    return jsonError("Введите название (минимум 2 символа)", 400);
  }
  const limited = rateLimited(req, "search");
  if (limited) return limited;
  if (!(await hasTmdbKey())) return keyProblem("TMDB_KEY_MISSING");
  try {
    return Response.json({ results: await searchTmdb(q) });
  } catch (err) {
    if (errorText(err) === "TMDB_KEY_INVALID") return keyProblem("TMDB_KEY_INVALID");
    return jsonError("TMDB не отвечает, попробуйте ещё раз", 502);
  }
}
