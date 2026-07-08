import { NextRequest, NextResponse } from "next/server";
import { parseAwardUrl } from "@/lib/parser";
import { getOrCreateReport } from "@/lib/report-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { url?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = parseAwardUrl(body.url ?? "");
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Ссылка не распознана. Ожидается адрес вида https://www.kinopoisk.ru/awards/oscar/2026/",
      },
      { status: 400 },
    );
  }

  try {
    const { payload, fetchedAt } = await getOrCreateReport(
      parsed.slug,
      parsed.year,
      Boolean(body.refresh),
    );
    return NextResponse.json({
      slug: parsed.slug,
      year: parsed.year,
      awardName: payload.awardName,
      fetchedAt: fetchedAt.toISOString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось построить отчёт";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
