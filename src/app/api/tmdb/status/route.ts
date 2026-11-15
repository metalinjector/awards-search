import { NextResponse } from "next/server";
import { hasTmdbKey } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: await hasTmdbKey(),
    fromEnv: Boolean(process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN),
    /** whether the key can be saved/removed from the UI (needs ADMIN_TOKEN on the server) */
    canManage: Boolean(process.env.ADMIN_TOKEN?.trim()),
  });
}
