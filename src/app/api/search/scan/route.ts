import { NextRequest, NextResponse } from "next/server";
import { scanPage } from "@/lib/search-service";
import { AWARDS } from "@/lib/awards";
import {
  enforceRateLimit,
  readJsonBody,
  RequestBodyError,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "scan", limit: 90, windowMs: 60 * 60_000 });
  if (limited) return limited;
  let body: { slug?: string; year?: number; refresh?: boolean };
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const bodyError = error instanceof RequestBodyError ? error : null;
    return NextResponse.json(
      { error: bodyError?.message ?? "Некорректный запрос" },
      { status: bodyError?.status ?? 400 },
    );
  }

  const slug = String(body.slug ?? "");
  const year = body.year;
  if (
    !AWARDS.some((a) => a.slug === slug) ||
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const result = await scanPage(slug, year, body.refresh === true);
  return NextResponse.json({ slug, year, ...result });
}
