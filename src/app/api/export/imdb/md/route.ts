import { NextRequest, NextResponse } from "next/server";
import { getImdbAwards } from "@/lib/imdb-service";
import { buildImdbMarkdown } from "@/lib/exporters";

export const maxDuration = 300;

export const dynamic = "force-dynamic";

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60) || "title";
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  const { payload } = await getImdbAwards(id);
  const md = buildImdbMarkdown(payload);
  const filename = `${sanitize(payload.title.title)}-imdb-awards.md`;
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="imdb-awards.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
