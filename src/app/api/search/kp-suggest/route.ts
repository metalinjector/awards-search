import { NextRequest, NextResponse } from "next/server";
import { searchKinopoiskFilms } from "@/lib/kp-suggest";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название фильма (минимум 2 символа)" },
      { status: 400 },
    );
  }
  try {
    const results = await searchKinopoiskFilms(q);
    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Не удалось выполнить поиск на Кинопоиске";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
