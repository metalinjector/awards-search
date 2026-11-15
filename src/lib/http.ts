/* Shared HTTP helper: timeout + retries with exponential backoff.
 * Retries only what can succeed on a second try (network errors, timeouts,
 * 429 and 5xx) — a 404 or any other 4xx fails immediately.
 */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

/** Non-2xx response. `message` keeps the "HTTP <status>" form callers match on. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

/** An error that must not be retried (e.g. the server understood us and said no) */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof PermanentError) return false;
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network failure / timeout
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Per-attempt timeout, covers reading the body too */
  timeoutMs?: number;
  /** Extra attempts after the first one */
  retries?: number;
  /** Delay before retry N (1-based) is backoffMs * 2^(N-1); 0 = retry at once */
  backoffMs?: number;
  /** Aborts the whole request (no further retries) */
  signal?: AbortSignal;
}

/**
 * Run a request and read its body with `read`, retrying transient failures.
 * Throws HttpError for non-2xx responses.
 */
export async function request<T>(
  url: string,
  read: (res: Response) => Promise<T>,
  opts: RequestOptions = {},
): Promise<T> {
  const { timeoutMs = 30_000, retries = 0, backoffMs = 0 } = opts;
  let lastError: unknown = new Error("request failed");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && backoffMs > 0) await sleep(backoffMs * 2 ** (attempt - 1));
    if (opts.signal?.aborted) break;

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal,
        cache: "no-store",
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new HttpError(res.status, url);
      }
      return await read(res);
    } catch (err) {
      lastError = timeout.aborted
        ? new Error(`таймаут ${Math.round(timeoutMs / 1000)} с`)
        : err;
      if (opts.signal?.aborted || !isRetryable(err)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const fetchJson = (url: string, opts?: RequestOptions) =>
  request(url, (res) => res.json() as Promise<unknown>, opts);

export const fetchText = (url: string, opts?: RequestOptions) =>
  request(url, (res) => res.text(), opts);

export const fetchBytes = (url: string, opts?: RequestOptions) =>
  request(url, (res) => res.arrayBuffer(), opts);
