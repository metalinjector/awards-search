import type { NextRequest } from "next/server";
import { download } from "@/lib/api";
import { loadFilmExport } from "@/lib/export-routes";
import { buildFilmMarkdown } from "@/lib/exporters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await loadFilmExport(req);
  if (data instanceof Response) return data;
  return download(buildFilmMarkdown(data.q, data.year, data.matches), "md", `${data.fileBase}.md`);
}
