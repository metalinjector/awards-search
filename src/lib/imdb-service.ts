import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { imdbPersons, imdbTitles } from "@/db/schema";
import {
  fetchImdbAwards,
  fetchImdbPerson,
  type ImdbAwardsPayload,
  type ImdbPersonPayload,
} from "./imdb";

const TTL_MS = 1000 * 60 * 60 * 24; // 24h

export async function getImdbAwards(
  imdbId: string,
  refresh = false,
): Promise<{ payload: ImdbAwardsPayload; fetchedAt: Date }> {
  const rows = await db
    .select()
    .from(imdbTitles)
    .where(eq(imdbTitles.imdbId, imdbId))
    .limit(1);
  if (!refresh && rows.length > 0) {
    const age = Date.now() - rows[0].fetchedAt.getTime();
    if (age < TTL_MS) {
      return { payload: rows[0].payload, fetchedAt: rows[0].fetchedAt };
    }
  }

  try {
    const payload = await fetchImdbAwards(imdbId);
    const now = new Date();
    await db
      .insert(imdbTitles)
      .values({ imdbId, payload, fetchedAt: now })
      .onConflictDoUpdate({
        target: [imdbTitles.imdbId],
        set: { payload, fetchedAt: sql`now()` },
      });
    return { payload, fetchedAt: now };
  } catch (err) {
    // A stale complete report is more useful than an outage screen.
    if (rows.length > 0) {
      return { payload: rows[0].payload, fetchedAt: rows[0].fetchedAt };
    }
    throw err;
  }
}

export async function getCachedImdbAwards(
  imdbId: string,
): Promise<ImdbAwardsPayload | null> {
  const rows = await db
    .select()
    .from(imdbTitles)
    .where(eq(imdbTitles.imdbId, imdbId))
    .limit(1);
  return rows.length > 0 ? rows[0].payload : null;
}

const PERSON_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function getImdbPerson(
  nameId: string,
): Promise<ImdbPersonPayload> {
  const rows = await db
    .select()
    .from(imdbPersons)
    .where(eq(imdbPersons.nameId, nameId))
    .limit(1);
  if (rows.length > 0) {
    const age = Date.now() - rows[0].fetchedAt.getTime();
    if (age < PERSON_TTL_MS) return rows[0].payload;
  }

  try {
    const payload = await fetchImdbPerson(nameId);
    await db
      .insert(imdbPersons)
      .values({ nameId, payload, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [imdbPersons.nameId],
        set: { payload, fetchedAt: sql`now()` },
      });
    return payload;
  } catch (err) {
    // If the source is temporarily down/rate-limited, serve stale cache
    if (rows.length > 0) return rows[0].payload;
    throw err;
  }
}
