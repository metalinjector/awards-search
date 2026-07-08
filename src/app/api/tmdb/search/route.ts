import { NextRequest, NextResponse } from "next/server";
import { hasTmdbKey, searchTmdb } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название (минимум 2 символа)" },
      { status: 400 },
    );
  }
  if (!(await hasTmdbKey())) {
    return NextResponse.json(
      { error: "TMDB_KEY_MISSING", configured: false },
      { status: 503 },
    );
  }
  try {
    const results = await searchTmdb(q);
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "TMDB_KEY_INVALID") {
      return NextResponse.json(
        { error: "TMDB_KEY_INVALID", configured: false },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "TMDB не отвечает, попробуйте ещё раз" },
      { status: 502 },
    );
  }
}
