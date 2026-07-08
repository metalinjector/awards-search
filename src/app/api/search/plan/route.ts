import { NextRequest, NextResponse } from "next/server";
import { buildScanPlan } from "@/lib/search-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  }
  const plan = await buildScanPlan(year);
  return NextResponse.json({ plan });
}
