/* Small helpers shared by the route handlers */

export const IMDB_TITLE_ID = /^tt\d{4,12}$/;
export const IMDB_NAME_ID = /^nm\d{4,12}$/;
export const IMDB_EVENT_ID = /^ev\d{4,12}$/;
export const AWARD_SLUG = /^[a-z0-9_-]{1,60}$/;

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** A 4-digit year in the supported range, or null */
export function parseYear(value: string | number | null | undefined): number | null {
  const year = typeof value === "number" ? value : parseInt(value ?? "", 10);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null;
}

/** Kinopoisk film id from a query parameter (digits only), or undefined */
export function parseKpId(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim();
  return /^\d{1,10}$/.test(v) ? v : undefined;
}

/** Strip characters that are invalid in file names */
export function safeFileName(s: string, fallback = "file", maxLength = 60): string {
  return (
    s
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength) || fallback
  );
}

/** RFC 5987 encoding for the Content-Disposition `filename*` parameter */
function rfc5987(s: string): string {
  return encodeURIComponent(s).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(filename)}`;
}

export const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  zip: "application/zip",
} as const;

/** File download response */
export function download(
  body: string | Uint8Array<ArrayBuffer> | Buffer,
  type: keyof typeof MIME,
  filename: string,
): Response {
  const payload = typeof body === "string" ? body : new Uint8Array(body);
  return new Response(payload, {
    headers: {
      "Content-Type": MIME[type],
      "Content-Disposition": contentDisposition(filename),
    },
  });
}
