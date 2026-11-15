import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { imdbEvents } from "@/db/schema";
import { fetchEventEdition } from "@/lib/imdb-event";
import { enforceRateLimit } from "@/lib/api-security";
import { runExternalTask } from "@/lib/work-queue";
import { observeOperation } from "@/lib/metrics";
import { errorMessage, logEvent } from "@/lib/logger";
import { parseYear } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "imdb_event", limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (!/^ev\d{4,12}$/.test(id) || year === null) {
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
  const eventTtlMs = 7 * 24 * 60 * 60 * 1000;
  if (cached.length > 0 && Date.now() - cached[0].fetchedAt.getTime() < eventTtlMs) {
    return NextResponse.json({ payload: cached[0].payload, stale: false });
  }

  const fetchAndStore = async () => {
    const payload = await runExternalTask(`imdb-event:${id}:${year}`, () =>
      observeOperation("imdb_event", () => fetchEventEdition(id, year)),
    );
    await db
      .insert(imdbEvents)
      .values({ eventId: id, year, payload })
      .onConflictDoUpdate({
        target: [imdbEvents.eventId, imdbEvents.year],
        set: { payload, fetchedAt: sql`now()` },
      });
    return payload;
  };

  if (cached.length > 0) {
    void fetchAndStore().catch((error) =>
      logEvent("warn", "imdb_event_background_refresh_failed", {
        id,
        year,
        error: errorMessage(error),
      }),
    );
    return NextResponse.json({ payload: cached[0].payload, stale: true });
  }

  try {
    const payload = await fetchAndStore();
    return NextResponse.json({ payload });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить данные события";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
