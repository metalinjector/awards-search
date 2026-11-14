import { adminEnabled } from "@/lib/admin";
import { hasTmdbKey } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    configured: await hasTmdbKey(),
    fromEnv: Boolean(process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN),
    /** whether the key can be saved/removed from the UI (needs ADMIN_TOKEN) */
    canManage: adminEnabled(),
  });
}
