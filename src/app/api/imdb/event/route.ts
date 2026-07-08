import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { imdbEvents } from "@/db/schema";
import { fetchEventEdition } from "@/lib/imdb-event";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (!/^ev\d{4,12}$/.test(id) || !Number.isFinite(year) || year < 1900 || year > 2100) {
    return NextResponse.json(
      { error: "Нужны параметры id (evXXXXXXX) и year" },
      { status: 400 },
    );
  }

  // cache lookup
  const cached = await db
    .select()
    .from(imdbEvents)
    .where(and(eq(imdbEvents.eventId, id), eq(imdbEvents.year, year)))
    .limit(1);
  if (cached.length > 0) {
    return NextResponse.json({ payload: cached[0].payload });
  }

  try {
    const payload = await fetchEventEdition(id, year);
    await db
      .insert(imdbEvents)
      .values({ eventId: id, year, payload })
      .onConflictDoUpdate({
        target: [imdbEvents.eventId, imdbEvents.year],
        set: { payload, fetchedAt: sql`now()` },
      });
    return NextResponse.json({ payload });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить данные события";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
