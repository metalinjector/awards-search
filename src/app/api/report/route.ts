import { NextRequest, NextResponse } from "next/server";
import { parseAwardUrl } from "@/lib/parser";
import { getOrCreateReport } from "@/lib/report-service";
import {
  enforceRateLimit,
  readJsonBody,
  RequestBodyError,
} from "@/lib/api-security";
import { AWARDS } from "@/lib/awards";
import { AwardSourceError } from "@/lib/parser";
import { QueueFullError } from "@/lib/work-queue";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "report", limit: 12, windowMs: 10 * 60_000 });
  if (limited) return limited;
  let body: { url?: string; refresh?: boolean };
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const bodyError = error instanceof RequestBodyError ? error : null;
    return NextResponse.json(
      { error: bodyError?.message ?? "Некорректный запрос" },
      { status: bodyError?.status ?? 400 },
    );
  }

  const parsed = parseAwardUrl(typeof body.url === "string" ? body.url : "");
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Ссылка не распознана. Ожидается адрес вида https://www.kinopoisk.ru/awards/oscar/2026/",
      },
      { status: 400 },
    );
  }
  if (!AWARDS.some((award) => award.slug === parsed.slug)) {
    return NextResponse.json({ error: "Эта премия пока не поддерживается" }, { status: 400 });
  }
  if (parsed.year > new Date().getFullYear()) {
    return NextResponse.json({ error: "Данные будущих церемоний ещё недоступны" }, { status: 400 });
  }
  const refresh = body.refresh === true;
  if (refresh) {
    const refreshLimited = enforceRateLimit(req, {
      name: "report_refresh",
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (refreshLimited) return refreshLimited;
  }

  try {
    const { payload, fetchedAt } = await getOrCreateReport(
      parsed.slug,
      parsed.year,
      refresh,
    );
    return NextResponse.json({
      slug: parsed.slug,
      year: parsed.year,
      awardName: payload.awardName,
      fetchedAt: fetchedAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof AwardSourceError
      ? err.message
      : err instanceof QueueFullError
        ? err.message
        : "Не удалось построить отчёт";
    return NextResponse.json(
      { error: message },
      { status: err instanceof QueueFullError ? 503 : 502 },
    );
  }
}
