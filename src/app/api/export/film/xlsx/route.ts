import type { NextRequest } from "next/server";
import { download } from "@/lib/api";
import { loadFilmExport } from "@/lib/export-routes";
import { buildFilmWorkbook } from "@/lib/exporters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const data = await loadFilmExport(req);
  if (data instanceof Response) return data;
  return download(await buildFilmWorkbook(data.q, data.year, data.matches), "xlsx", `${data.fileBase}.xlsx`);
}
