import { NextRequest, NextResponse } from "next/server";
import { getImdbAwards } from "@/lib/imdb-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  try {
    const { payload, fetchedAt } = await getImdbAwards(id, refresh);
    return NextResponse.json({ payload, fetchedAt: fetchedAt.toISOString() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить данные IMDb";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
