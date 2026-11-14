import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, HttpError, PermanentError, request } from "@/lib/http";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("request retries", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const opts = { retries: 3, backoffMs: 0 };

  it("does not retry a 404", async () => {
    fetchMock.mockResolvedValue(json({}, 404));
    const err: unknown = await fetchJson("https://x/", opts).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).message).toBe("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx and 429 until it succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ ok: 1 }));
    expect(await fetchJson("https://x/", opts)).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json({ ok: 1 }));
    expect(await fetchJson("https://x/", opts)).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the allowed number of attempts", async () => {
    fetchMock.mockImplementation(async () => json({}, 503));
    await expect(fetchJson("https://x/", opts)).rejects.toThrow("HTTP 503");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a PermanentError raised while reading the body", async () => {
    fetchMock.mockImplementation(async () => json({ errors: ["bad query"] }));
    await expect(
      request(
        "https://x/",
        async () => {
          throw new PermanentError("bad query");
        },
        opts,
      ),
    ).rejects.toThrow("bad query");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging request", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(fetchJson("https://x/", { timeoutMs: 30 })).rejects.toThrow(/таймаут/);
  });

  it("stops at once when the caller aborts", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    await expect(
      fetchJson("https://x/", { ...opts, signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
