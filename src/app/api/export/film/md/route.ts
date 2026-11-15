import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";
import { buildFilmMarkdown } from "@/lib/exporters";
import { enforceRateLimit } from "@/lib/api-security";
import { parseYear } from "@/lib/validation";

export const dynamic = "force-dynamic";

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "film";
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "export_film", limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const kpId = (req.nextUrl.searchParams.get("kpId") ?? "").trim();
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (q.length < 2 || year === null) {
    return NextResponse.json(
      { error: "Нужны параметры q (название) и year (год фильма)" },
      { status: 400 },
    );
  }

  if (kpId && !/^\d{1,12}$/.test(kpId)) {
    return NextResponse.json({ error: "Некорректный ID Кинопоиска" }, { status: 400 });
  }
  const { matches } = await searchFilm(q, year, kpId || undefined);
  const md = buildFilmMarkdown(q, year, matches);
  const filename = `${sanitizeFilename(q)}-${year}-awards.md`;

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="awards.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
