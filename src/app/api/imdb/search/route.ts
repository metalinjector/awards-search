import { NextRequest, NextResponse } from "next/server";
import { searchImdbTitles } from "@/lib/imdb";
import { enforceRateLimit } from "@/lib/api-security";
import { runExternalTask } from "@/lib/work-queue";
import { observeOperation } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "imdb_search", limit: 40, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название (минимум 2 символа)" },
      { status: 400 },
    );
  }
  try {
    const results = await runExternalTask(`imdb-search:${q.toLocaleLowerCase("ru")}`, () =>
      observeOperation("imdb_search", () => searchImdbTitles(q)),
    );
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "IMDb не отвечает, попробуйте ещё раз" },
      { status: 502 },
    );
  }
}
