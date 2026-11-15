import { NextRequest, NextResponse } from "next/server";
import { buildScanPlan } from "@/lib/search-service";
import { parseYear } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (year === null) {
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  }
  const plan = await buildScanPlan(year);
  return NextResponse.json({ plan });
}
