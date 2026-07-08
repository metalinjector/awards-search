import { NextRequest, NextResponse } from "next/server";
import { scanPage } from "@/lib/search-service";
import { AWARDS } from "@/lib/awards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { slug?: string; year?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const slug = String(body.slug ?? "");
  const year = Number(body.year);
  if (
    !AWARDS.some((a) => a.slug === slug) ||
    !Number.isFinite(year) ||
    year < 1900 ||
    year > 2100
  ) {
    return NextResponse.json({ error: "Некорректные параметры" }, { status: 400 });
  }

  const status = await scanPage(slug, year);
  return NextResponse.json({ slug, year, status });
}
