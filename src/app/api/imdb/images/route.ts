import { NextRequest, NextResponse } from "next/server";
import { fetchTitleImages } from "@/lib/imdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  try {
    const page = await fetchTitleImages(id, pageToken);
    return NextResponse.json(page);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить галерею";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
