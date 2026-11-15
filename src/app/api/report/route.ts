import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { errorText } from "@/lib/log";
import { AwardNotFoundError, parseAwardUrl } from "@/lib/parser";
import { rateLimited } from "@/lib/rate-limit";
import { getOrCreateReport } from "@/lib/report-service";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "report");
  if (limited) return limited;

  let body: { url?: string; refresh?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный запрос", 400);
  }

  const parsed = parseAwardUrl(String(body.url ?? ""));
  if (!parsed) {
    return jsonError(
      "Ссылка не распознана. Ожидается адрес вида https://www.kinopoisk.ru/awards/oscar/2026/",
      400,
    );
  }

  try {
    const { payload, fetchedAt } = await getOrCreateReport(parsed.slug, parsed.year, {
      refresh: Boolean(body.refresh),
    });
    return Response.json({
      slug: parsed.slug,
      year: parsed.year,
      awardName: payload.awardName,
      fetchedAt: fetchedAt.toISOString(),
    });
  } catch (err) {
    return jsonError(
      errorText(err) || "Не удалось построить отчёт",
      err instanceof AwardNotFoundError ? 404 : 502,
    );
  }
}
