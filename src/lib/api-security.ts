import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { incrementMetric } from "./metrics";

interface RateBucket {
  count: number;
  resetAt: number;
  touchedAt: number;
}

const globalForSecurity = globalThis as typeof globalThis & {
  __awardsRateBuckets?: Map<string, RateBucket>;
};

const buckets =
  globalForSecurity.__awardsRateBuckets ??
  (globalForSecurity.__awardsRateBuckets = new Map());

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowMs: number;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .at(-1)
    ?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function cleanup(now: number): void {
  if (buckets.size < 2_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.touchedAt > 24 * 60 * 60 * 1000) buckets.delete(key);
  }
}

export function enforceRateLimit(
  req: NextRequest,
  options: RateLimitOptions,
): NextResponse | null {
  const now = Date.now();
  cleanup(now);
  const key = `${options.name}:${clientIp(req)}`;
  const existing = buckets.get(key);
  const bucket =
    !existing || existing.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs, touchedAt: now }
      : existing;
  bucket.count += 1;
  bucket.touchedAt = now;
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) return null;
  incrementMetric(`rate_limit_${options.name}_total`);
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "Слишком много запросов. Попробуйте позже.", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}

export function rejectLargeBody(
  req: NextRequest,
  maxBytes = 8 * 1024,
): NextResponse | null {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    incrementMetric("request_body_too_large_total");
    return NextResponse.json({ error: "Запрос слишком большой" }, { status: 413 });
  }
  return null;
}

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

/** Read JSON with a real byte limit, including requests without Content-Length. */
export async function readJsonBody<T>(
  req: NextRequest,
  maxBytes = 8 * 1024,
): Promise<T> {
  const advertised = rejectLargeBody(req, maxBytes);
  if (advertised) throw new RequestBodyError("Запрос слишком большой", 413);
  if (!req.body) throw new RequestBodyError("Некорректный запрос", 400);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      incrementMetric("request_body_too_large_total");
      await reader.cancel();
      throw new RequestBodyError("Запрос слишком большой", 413);
    }
    chunks.push(value);
  }

  try {
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
    return JSON.parse(body) as T;
  } catch {
    throw new RequestBodyError("Некорректный запрос", 400);
  }
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAdminAuthorized(req: NextRequest): boolean {
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (!configured) return false;
  const authorization = req.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : req.headers.get("x-admin-token")?.trim() ?? "";
  return Boolean(supplied) && safeEqual(supplied, configured);
}

export function requireAdmin(req: NextRequest): NextResponse | null {
  if (isAdminAuthorized(req)) return null;
  incrementMetric("admin_auth_denied_total");
  return NextResponse.json({ error: "Требуется авторизация администратора" }, { status: 401 });
}
