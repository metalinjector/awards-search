import type { NextRequest } from "next/server";
import { download } from "@/lib/api";
import { loadReportExport } from "@/lib/export-routes";
import { buildMarkdown } from "@/lib/exporters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await loadReportExport(req);
  if (data instanceof Response) return data;
  return download(buildMarkdown(data.payload), "md", `${data.fileBase}.md`);
}
