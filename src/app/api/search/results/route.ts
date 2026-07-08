import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название фильма (минимум 2 символа)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  }
  const result = await searchFilm(q, year);
  return NextResponse.json(result);
}
