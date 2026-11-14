import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchImdbAwards } from "@/lib/imdb";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const nomination = (n: number) => ({
  event: { id: "ev0000003", name: "Academy Awards" },
  year: 2024,
  category: `Category ${n}`,
  isWinner: n === 1,
  nominees: [{ id: "nm0000001", displayName: "Someone" }],
});

describe("fetchImdbAwards", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Serve the title and nomination pages; `page2` decides what the 2nd page does */
  function serve(page2: () => Response) {
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.includes("/awardNominations")) {
        return json({ primaryTitle: "Oppenheimer", startYear: 2023 });
      }
      if (url.includes("pageToken=")) return page2();
      return json({
        stats: { nominationCount: 3, winCount: 1 },
        awardNominations: [nomination(1), nomination(2)],
        nextPageToken: "p2",
      });
    });
  }

  it("collects all pages", async () => {
    serve(() => json({ awardNominations: [nomination(3)] }));
    const promise = fetchImdbAwards("tt15398776");
    await vi.runAllTimersAsync();
    const payload = await promise;
    expect(payload.nominations).toHaveLength(3);
    expect(payload.stats).toEqual({ nominationCount: 3, winCount: 1 });
    expect(payload.partial).toBeUndefined();
  });

  it("flags the result as partial when the API rate-limits mid-way", async () => {
    serve(() => json({}, 429));
    const promise = fetchImdbAwards("tt15398776");
    await vi.runAllTimersAsync();
    const payload = await promise;
    expect(payload.nominations).toHaveLength(2);
    expect(payload.partial).toBe(true);
  });

  it("fails at once on an unknown title instead of retrying for a minute", async () => {
    fetchMock.mockImplementation(async () => json({}, 404));
    await expect(fetchImdbAwards("tt9999999")).rejects.toThrow("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed ids without any request", async () => {
    await expect(fetchImdbAwards("nope")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
