-- Baseline. Databases created earlier by `drizzle-kit push` already have these
-- objects, so every statement is idempotent: on such a database this is a no-op.
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imdb_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"year" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imdb_persons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imdb_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"imdb_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_slug" text NOT NULL,
	"year" integer NOT NULL,
	"award_name" text NOT NULL,
	"source_url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_misses" (
	"id" serial PRIMARY KEY NOT NULL,
	"award_slug" text NOT NULL,
	"year" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_idx" ON "app_settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "imdb_events_id_year_idx" ON "imdb_events" USING btree ("event_id","year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "imdb_persons_id_idx" ON "imdb_persons" USING btree ("name_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "imdb_titles_id_idx" ON "imdb_titles" USING btree ("imdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_slug_year_idx" ON "reports" USING btree ("award_slug","year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_year_idx" ON "reports" USING btree ("year");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scan_misses_slug_year_idx" ON "scan_misses" USING btree ("award_slug","year");