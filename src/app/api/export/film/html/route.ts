import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";
import { buildFilmHtml } from "@/lib/html-export";

export const dynamic = "force-dynamic";

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "film";
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (q.length < 2 || !Number.isFinite(year) || year < 1900 || year > 2100) {
    return NextResponse.json(
      { error: "Нужны параметры q (название) и year (год фильма)" },
      { status: 400 },
    );
  }
  const { matches } = await searchFilm(q, year);
  const html = buildFilmHtml(q, year, matches);
  const filename = `${sanitize(q)}-${year}-awards.html`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="awards.html"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
