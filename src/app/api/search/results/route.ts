import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";
import { parseYear } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kpId = (req.nextUrl.searchParams.get("kpId") ?? "").trim();
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название фильма (минимум 2 символа)" },
      { status: 400 },
    );
  }
  if (year === null) {
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  }
  if (kpId && !/^\d{1,12}$/.test(kpId)) {
    return NextResponse.json({ error: "Некорректный ID Кинопоиска" }, { status: 400 });
  }
  const result = await searchFilm(q, year, kpId || undefined);
  return NextResponse.json(result);
}
