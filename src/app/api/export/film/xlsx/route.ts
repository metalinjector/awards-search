import { NextRequest, NextResponse } from "next/server";
import { searchFilm } from "@/lib/search-service";
import { buildFilmWorkbook } from "@/lib/exporters";

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
  const buffer = await buildFilmWorkbook(q, year, matches);
  const filename = `${sanitizeFilename(q)}-${year}-awards.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="awards.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
