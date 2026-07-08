import { NextRequest, NextResponse } from "next/server";
import { getImdbAwards } from "@/lib/imdb-service";
import { buildImdbWorkbook } from "@/lib/exporters";

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
  const buffer = await buildImdbWorkbook(payload);
  const filename = `${sanitize(payload.title.title)}-imdb-awards.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="imdb-awards.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
