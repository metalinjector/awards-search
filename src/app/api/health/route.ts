import { db } from "@/db";
import { sql } from "drizzle-orm";
import { externalQueueSnapshot } from "@/lib/work-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = performance.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      {
        ok: true,
        database: "ok",
        databaseLatencyMs: Math.round(performance.now() - started),
        queue: externalQueueSnapshot(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, database: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
