import type { NextRequest } from "next/server";
import { download } from "@/lib/api";
import { loadReportExport } from "@/lib/export-routes";
import { buildReportHtml } from "@/lib/html-export";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await loadReportExport(req);
  if (data instanceof Response) return data;
  return download(buildReportHtml(data.payload), "html", `${data.fileBase}.html`);
}
