import { NextRequest, NextResponse } from "next/server";
import { getImdbPerson } from "@/lib/imdb-service";
import { enforceRateLimit } from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "imdb_person", limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;
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
