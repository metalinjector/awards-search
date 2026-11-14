import { NextRequest } from "next/server";
import { jsonError, parseYear } from "@/lib/api";
import { buildScanPlan } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (year === null) return jsonError("Некорректный год", 400);
  return Response.json({ plan: await buildScanPlan(year) });
}
