import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = join(root, "migrations");
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(migrationDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of files) {
    const sql = await readFile(join(migrationDirectory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "select checksum from app_migrations where name = $1",
      [name],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration changed: ${name}`);
      }
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into app_migrations(name, checksum) values ($1, $2)",
        [name, checksum],
      );
      await client.query("commit");
      console.info(JSON.stringify({ event: "migration_applied", name }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
