import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { imdbEvents, imdbPersons, imdbTitles } from "@/db/schema";
import { isEventStale } from "./freshness";
import {
  fetchImdbAwards,
  fetchImdbPerson,
  type ImdbAwardsPayload,
  type ImdbPersonPayload,
} from "./imdb";
import { fetchEventEdition, type EventEditionPayload } from "./imdb-event";
import { dedupe } from "./inflight";
import { errorText, log } from "./log";

const HOUR = 1000 * 60 * 60;
const TITLE_TTL_MS = 24 * HOUR;
const PERSON_TTL_MS = 7 * 24 * HOUR;
/** Incomplete data (source rate-limited us mid-way) is retried soon */
const PARTIAL_TTL_MS = HOUR / 6;

interface Cached<T> {
  payload: T;
  fetchedAt: Date;
}

function isFresh<T extends { partial?: boolean }>(
  row: Cached<T>,
  ttlMs: number,
): boolean {
  const ttl = row.payload.partial ? PARTIAL_TTL_MS : ttlMs;
  return Date.now() - row.fetchedAt.getTime() < ttl;
}

/**
 * Shared cache policy: serve fresh cache; otherwise fetch, and
 *  - if the source is down, fall back to whatever is cached;
 *  - never let an incomplete result replace a complete cached one.
 */
async function cached<T extends { partial?: boolean }>(
  key: string,
  ttlMs: number,
  refresh: boolean,
  load: () => Promise<Cached<T> | null>,
  fetchFresh: () => Promise<T>,
  save: (payload: T) => Promise<void>,
): Promise<Cached<T>> {
  const row = await load();
  if (row && !refresh && isFresh(row, ttlMs)) return row;

  let payload: T;
  try {
    payload = await dedupe(key, fetchFresh);
  } catch (err) {
    if (!row) throw err;
    log.warn("imdb", "source failed, serving cached copy", { key, error: errorText(err) });
    return row;
  }
  if (payload.partial && row && !row.payload.partial) return row;

  await save(payload);
  return { payload, fetchedAt: new Date() };
}

export function getImdbAwards(
  imdbId: string,
  refresh = false,
): Promise<Cached<ImdbAwardsPayload>> {
  return cached(
    `imdb-title:${imdbId}`,
    TITLE_TTL_MS,
    refresh,
    async () => {
      const rows = await db
        .select()
        .from(imdbTitles)
        .where(eq(imdbTitles.imdbId, imdbId))
        .limit(1);
      return rows[0] ?? null;
    },
    () => fetchImdbAwards(imdbId),
    async (payload) => {
      await db
        .insert(imdbTitles)
        .values({ imdbId, payload })
        .onConflictDoUpdate({
          target: [imdbTitles.imdbId],
          set: { payload, fetchedAt: sql`now()` },
        });
    },
  );
}

export async function getImdbPerson(
  nameId: string,
  refresh = false,
): Promise<ImdbPersonPayload> {
  const { payload } = await cached(
    `imdb-person:${nameId}`,
    PERSON_TTL_MS,
    refresh,
    async () => {
      const rows = await db
        .select()
        .from(imdbPersons)
        .where(eq(imdbPersons.nameId, nameId))
        .limit(1);
      return rows[0] ?? null;
    },
    () => fetchImdbPerson(nameId),
    async (payload) => {
      await db
        .insert(imdbPersons)
        .values({ nameId, payload })
        .onConflictDoUpdate({
          target: [imdbPersons.nameId],
          set: { payload, fetchedAt: sql`now()` },
        });
    },
  );
  return payload;
}

/**
 * All nominees of one ceremony. An edition fetched during its own year may
 * still gain winners, so it is re-checked daily; later it is final.
 */
export async function getImdbEvent(
  eventId: string,
  year: number,
): Promise<EventEditionPayload> {
  const rows = await db
    .select()
    .from(imdbEvents)
    .where(and(eq(imdbEvents.eventId, eventId), eq(imdbEvents.year, year)))
    .limit(1);
  const row = rows[0];
  if (row && !isEventStale(year, row.fetchedAt)) return row.payload;

  let payload: EventEditionPayload;
  try {
    payload = await dedupe(`imdb-event:${eventId}:${year}`, () =>
      fetchEventEdition(eventId, year),
    );
  } catch (err) {
    if (!row) throw err;
    log.warn("imdb", "event refresh failed, serving cached copy", {
      eventId,
      year,
      error: errorText(err),
    });
    return row.payload;
  }
  await db
    .insert(imdbEvents)
    .values({ eventId, year, payload })
    .onConflictDoUpdate({
      target: [imdbEvents.eventId, imdbEvents.year],
      set: { payload, fetchedAt: sql`now()` },
    });
  return payload;
}
