CREATE TABLE IF NOT EXISTS reports (
  id serial PRIMARY KEY,
  award_slug text NOT NULL,
  year integer NOT NULL,
  award_name text NOT NULL,
  source_url text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reports_slug_year_idx ON reports (award_slug, year);
CREATE INDEX IF NOT EXISTS reports_year_idx ON reports (year);

CREATE TABLE IF NOT EXISTS imdb_titles (
  id serial PRIMARY KEY,
  imdb_id text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS imdb_titles_id_idx ON imdb_titles (imdb_id);

CREATE TABLE IF NOT EXISTS imdb_events (
  id serial PRIMARY KEY,
  event_id text NOT NULL,
  year integer NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS imdb_events_id_year_idx ON imdb_events (event_id, year);

CREATE TABLE IF NOT EXISTS imdb_persons (
  id serial PRIMARY KEY,
  name_id text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS imdb_persons_id_idx ON imdb_persons (name_id);

CREATE TABLE IF NOT EXISTS app_settings (
  id serial PRIMARY KEY,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_key_idx ON app_settings (key);

CREATE TABLE IF NOT EXISTS scan_misses (
  id serial PRIMARY KEY,
  award_slug text NOT NULL,
  year integer NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS scan_misses_slug_year_idx ON scan_misses (award_slug, year);
