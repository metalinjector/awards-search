import { NextRequest, NextResponse } from "next/server";
import { getStoredReport } from "@/lib/report-service";
import { buildWorkbook } from "@/lib/exporters";
import { enforceRateLimit } from "@/lib/api-security";
import { parseYear } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { name: "export_report", limit: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const year = parseYear(req.nextUrl.searchParams.get("year"));
  if (!slug || year === null) {
    return NextResponse.json({ error: "Нужны параметры slug и year" }, { status: 400 });
  }

  const stored = await getStoredReport(slug, year);
  if (!stored) {
    return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
  }

  const buffer = await buildWorkbook(stored.payload);
  const filename = `${slug}-${year}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
