import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { searchImdbTitles } from "@/lib/imdb";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 200) {
    return jsonError("Введите название (минимум 2 символа)", 400);
  }
  const limited = rateLimited(req, "search");
  if (limited) return limited;
  try {
    return Response.json({ results: await searchImdbTitles(q) });
  } catch {
    return jsonError("IMDb не отвечает, попробуйте ещё раз", 502);
  }
}
