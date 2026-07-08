import { NextResponse } from "next/server";
import { hasTmdbKey } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: await hasTmdbKey(),
    fromEnv: Boolean(process.env.TMDB_API_KEY || process.env.TMDB_ACCESS_TOKEN),
  });
}
