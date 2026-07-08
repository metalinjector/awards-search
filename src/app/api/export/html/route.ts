import { NextRequest, NextResponse } from "next/server";
import { getStoredReport } from "@/lib/report-service";
import { buildReportHtml } from "@/lib/html-export";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (!slug || !Number.isFinite(year)) {
    return NextResponse.json({ error: "Нужны параметры slug и year" }, { status: 400 });
  }
  const stored = await getStoredReport(slug, year);
  if (!stored) {
    return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
  }
  const html = buildReportHtml(stored.payload);
  const filename = `${slug}-${year}.html`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
