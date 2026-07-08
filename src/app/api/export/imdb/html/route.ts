import { NextRequest, NextResponse } from "next/server";
import { getImdbAwards } from "@/lib/imdb-service";
import { buildImdbHtml } from "@/lib/html-export";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "title";
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  const { payload } = await getImdbAwards(id);
  const html = buildImdbHtml(payload);
  const filename = `${sanitize(payload.title.title)}-imdb-awards.html`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="imdb-awards.html"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
