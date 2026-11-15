import { NextRequest, NextResponse } from "next/server";
import { resolveTmdbToImdb } from "@/lib/tmdb";
import { enforceRateLimit } from "@/lib/api-security";
import { runExternalTask } from "@/lib/work-queue";
import { observeOperation } from "@/lib/metrics";
import { parsePositiveId } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "tmdb_resolve", limit: 40, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const id = parsePositiveId(req.nextUrl.searchParams.get("id"));
  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (id === null || (type !== "movie" && type !== "tv")) {
    return NextResponse.json(
      { error: "Нужны параметры id (число) и type (movie|tv)" },
      { status: 400 },
    );
  }
  try {
    const result = await runExternalTask(`tmdb-resolve:${type}:${id}`, () =>
      observeOperation("tmdb_resolve", () => resolveTmdbToImdb(id, type)),
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Не удалось получить данные TMDB" },
      { status: 502 },
    );
  }
}
