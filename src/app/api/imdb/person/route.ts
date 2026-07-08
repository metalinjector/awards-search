import { NextRequest, NextResponse } from "next/server";
import { getImdbPerson } from "@/lib/imdb-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^nm\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID персоны" }, { status: 400 });
  }
  try {
    const payload = await getImdbPerson(id);
    return NextResponse.json(payload);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    const message = /HTTP 429/.test(raw)
      ? "IMDb API временно ограничил запросы — подождите 10–20 секунд и обновите страницу."
      : raw || "Не удалось получить данные персоны";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
