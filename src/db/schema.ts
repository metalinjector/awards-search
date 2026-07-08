import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ReportPayload } from "@/lib/types";

export const reports = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    awardSlug: text("award_slug").notNull(),
    year: integer("year").notNull(),
    awardName: text("award_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    payload: jsonb("payload").$type<ReportPayload>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reports_slug_year_idx").on(t.awardSlug, t.year),
    index("reports_year_idx").on(t.year),
  ],
);

/** Cached IMDb award data per title */
export const imdbTitles = pgTable(
  "imdb_titles",
  {
    id: serial("id").primaryKey(),
    imdbId: text("imdb_id").notNull(),
    payload: jsonb("payload").$type<import("@/lib/imdb").ImdbAwardsPayload>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("imdb_titles_id_idx").on(t.imdbId)],
);

/** Cached IMDb event editions (all nominees of a ceremony) */
export const imdbEvents = pgTable(
  "imdb_events",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    year: integer("year").notNull(),
    payload: jsonb("payload")
      .$type<import("@/lib/imdb-event").EventEditionPayload>()
      .notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("imdb_events_id_year_idx").on(t.eventId, t.year)],
);

/** Simple key-value settings (e.g. TMDB API key entered via UI) */
export const appSettings = pgTable(
  "app_settings",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("app_settings_key_idx").on(t.key)],
);

/** Cached IMDb person data (info + filmography) */
export const imdbPersons = pgTable(
  "imdb_persons",
  {
    id: serial("id").primaryKey(),
    nameId: text("name_id").notNull(),
    payload: jsonb("payload")
      .$type<import("@/lib/imdb").ImdbPersonPayload>()
      .notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("imdb_persons_id_idx").on(t.nameId)],
);

/** Pages we tried to scan but that don't exist / have no data — cached to avoid rescanning */
export const scanMisses = pgTable(
  "scan_misses",
  {
    id: serial("id").primaryKey(),
    awardSlug: text("award_slug").notNull(),
    year: integer("year").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("scan_misses_slug_year_idx").on(t.awardSlug, t.year)],
);
