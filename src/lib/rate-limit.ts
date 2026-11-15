/* In-memory fixed-window rate limiter (the app runs as a single instance). */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when !ok) */
  retryAfterSec: number;
}

export function checkRate(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateResult {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Client address as seen by the reverse proxy. The right-most X-Forwarded-For
 * entry is the one added by our own proxy; anything to the left is client-supplied.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const last = xff.split(",").pop()?.trim();
    if (last) return last;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

const TEN_MINUTES = 10 * 60 * 1000;

/** Per-client limits per 10 minutes, by kind of work */
export const LIMITS = {
  /** one film search scans up to 72 pages */
  scan: 300,
  /** building / refreshing a report from Kinopoisk */
  report: 30,
  kpSuggest: 20,
  /** api.imdbapi.dev / IMDb GraphQL lookups */
  imdb: 90,
  imdbImages: 300,
  search: 120,
  zip: 5,
  /** admin-token guesses */
  admin: 10,
} as const;

export function limitFor(
  headers: Headers,
  kind: keyof typeof LIMITS,
): RateResult {
  return checkRate(`${kind}:${clientIp(headers)}`, LIMITS[kind], TEN_MINUTES);
}

export const RATE_LIMIT_MESSAGE =
  "Слишком много запросов — подождите несколько минут и повторите.";

/** Returns a 429 response when the client is over the limit, otherwise null */
export function rateLimited(req: Request, kind: keyof typeof LIMITS): Response | null {
  const r = limitFor(req.headers, kind);
  if (r.ok) return null;
  return Response.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}
