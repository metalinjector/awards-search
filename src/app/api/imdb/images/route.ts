import { NextRequest, NextResponse } from "next/server";
import { fetchTitleImages } from "@/lib/imdb";
import { enforceRateLimit } from "@/lib/api-security";
import { runExternalTask } from "@/lib/work-queue";
import { observeOperation } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "imdb_images", limit: 90, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  try {
    const page = await runExternalTask(`imdb-images:${id}:${pageToken ?? "first"}`, () =>
      observeOperation("imdb_images", () => fetchTitleImages(id, pageToken)),
    );
    return NextResponse.json(page);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить галерею";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
