import { NextRequest, NextResponse } from "next/server";
import { searchKinopoiskFilms } from "@/lib/kp-suggest";
import { enforceRateLimit } from "@/lib/api-security";
import { runExternalTask } from "@/lib/work-queue";
import { observeOperation } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "kp_suggest", limit: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Введите название фильма (минимум 2 символа)" },
      { status: 400 },
    );
  }
  try {
    const results = await runExternalTask(`kp-suggest:${q.toLocaleLowerCase("ru")}`, () =>
      observeOperation("kp_suggest", () => searchKinopoiskFilms(q)),
    );
    return NextResponse.json({ results });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Не удалось выполнить поиск на Кинопоиске";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
