import type { NextRequest } from "next/server";
import { download } from "@/lib/api";
import { loadImdbExport } from "@/lib/export-routes";
import { buildImdbHtml } from "@/lib/html-export";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const data = await loadImdbExport(req);
  if (data instanceof Response) return data;
  return download(buildImdbHtml(data.payload), "html", `${data.fileBase}.html`);
}
