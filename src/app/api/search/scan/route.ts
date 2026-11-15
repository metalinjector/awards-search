import { NextRequest } from "next/server";
import { jsonError, parseYear } from "@/lib/api";
import { awardNameBySlug } from "@/lib/awards";
import { rateLimited } from "@/lib/rate-limit";
import { scanPage } from "@/lib/search-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const limited = rateLimited(req, "scan");
  if (limited) return limited;

  let body: { slug?: string; year?: number };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный запрос", 400);
  }

  const slug = String(body.slug ?? "");
  const year = parseYear(body.year);
  if (!awardNameBySlug.has(slug) || year === null) {
    return jsonError("Некорректные параметры", 400);
  }

  const status = await scanPage(slug, year);
  return Response.json({ slug, year, status });
}
