const GRAPHQL_URL = "https://api.graphql.imdb.com/";

const GRAPHQL_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://www.imdb.com",
  Referer: "https://www.imdb.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
  "X-Imdb-User-Country": "US",
  "X-Imdb-User-Language": "en-US",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ImdbGraphqlError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ImdbGraphqlError";
  }
}

interface GraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{
    message?: string;
    extensions?: { isRetryable?: boolean };
  }>;
}

function networkErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error) || !("cause" in err)) return undefined;
  const cause = err.cause;
  if (!cause || typeof cause !== "object" || !("code" in cause)) return undefined;
  return typeof cause.code === "string" ? cause.code : undefined;
}

function shouldRetry(err: unknown): boolean {
  if (err instanceof ImdbGraphqlError) return err.retryable;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const code = networkErrorCode(err);
  if (code === "ENOTFOUND" || code === "ERR_INVALID_URL") return false;
  return err instanceof TypeError;
}

/** Request the GraphQL endpoint used by imdb.com, with bounded transient retries. */
export async function imdbGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<T> {
  let lastError: unknown = new Error("IMDb GraphQL request failed");

  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: GRAPHQL_HEADERS,
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
        cache: "no-store",
      });

      const raw = await response.text();
      let envelope: GraphqlEnvelope<T>;
      try {
        envelope = JSON.parse(raw) as GraphqlEnvelope<T>;
      } catch {
        throw new ImdbGraphqlError(
          `IMDb GraphQL вернул некорректный ответ (HTTP ${response.status})`,
          response.status === 429 || response.status >= 500,
        );
      }

      const graphqlMessage = envelope.errors?.find((item) => item.message)?.message;
      if (!response.ok || envelope.errors?.length) {
        const retryable =
          response.status === 429 ||
          response.status >= 500 ||
          envelope.errors?.some((item) => item.extensions?.isRetryable) === true;
        throw new ImdbGraphqlError(
          graphqlMessage ?? `IMDb GraphQL: HTTP ${response.status}`,
          retryable,
        );
      }
      if (envelope.data === undefined) {
        throw new ImdbGraphqlError("IMDb GraphQL вернул пустой ответ", true);
      }
      return envelope.data;
    } catch (err) {
      lastError = err;
      if (!shouldRetry(err) || attempt === 3) throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

export interface GraphqlPageInfo {
  hasNextPage?: boolean;
  endCursor?: string | null;
}
