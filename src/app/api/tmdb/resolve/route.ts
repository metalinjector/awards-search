import { NextRequest, NextResponse } from "next/server";
import { resolveTmdbToImdb } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") ?? "", 10);
  const type = req.nextUrl.searchParams.get("type") ?? "";
  if (!Number.isFinite(id) || id <= 0 || (type !== "movie" && type !== "tv")) {
    return NextResponse.json(
      { error: "Нужны параметры id (число) и type (movie|tv)" },
      { status: 400 },
    );
  }
  try {
    const result = await resolveTmdbToImdb(id, type);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Не удалось получить данные TMDB" },
      { status: 502 },
    );
  }
}
