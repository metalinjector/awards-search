import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-security";
import { metricsSnapshot } from "@/lib/metrics";
import { externalQueueSnapshot } from "@/lib/work-queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ ...metricsSnapshot(), queue: externalQueueSnapshot() });
}
