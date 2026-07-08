import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";
import { buildFilmMarkdown } from "@/lib/exporters";

export const dynamic = "force-dynamic";

function sanitizeFilename(s: string): string {
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
  const md = buildFilmMarkdown(q, year, matches);
  const filename = `${sanitizeFilename(q)}-${year}-awards.md`;

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="awards.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
