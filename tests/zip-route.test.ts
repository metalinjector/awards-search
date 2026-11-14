import { unzipSync } from "fflate";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryPage } from "@/lib/imdb";

vi.mock("@/lib/imdb", () => ({
  fetchOfficialTitle: vi.fn(async () => "Ready or Not"),
  fetchTitleImages: vi.fn(),
}));

import { fetchTitleImages } from "@/lib/imdb";
import { GET } from "@/app/api/imdb/images/zip/route";

const pagesMock = vi.mocked(fetchTitleImages);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A gallery of `count` images, `perPage` per page */
function gallery(count: number, perPage: number) {
  pagesMock.mockImplementation(async (_id, token): Promise<GalleryPage> => {
    const start = token ? Number(token) : 0;
    const end = Math.min(start + perPage, count);
    return {
      images: Array.from({ length: end - start }, (_v, i) => ({
        url: `https://img.test/${start + i}.jpg`,
        type: (start + i) % 2 ? "still_frame" : "poster",
      })),
      totalCount: count,
      nextPageToken: end < count ? String(end) : undefined,
    };
  });
}

let ip = 0;
/** Each test request comes from its own address so the per-client limit doesn't interfere */
const zipRequest = () =>
  new NextRequest("http://localhost/api/imdb/images/zip?id=tt7798634", {
    headers: { "x-forwarded-for": `10.0.0.${++ip}` },
  });

describe("GET /api/imdb/images/zip", () => {
  let imageFetches: string[];
  beforeEach(() => {
    imageFetches = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        imageFetches.push(url);
        if (url.endsWith("/3.jpg")) return new Response("gone", { status: 404 });
        return new Response(new Uint8Array(64 * 1024).fill(Number(url.match(/(\d+)\.jpg/)![1])));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    pagesMock.mockReset();
  });

  it("streams every image of every page into the archive", async () => {
    gallery(12, 5);
    const res = await GET(zipRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain('filename="Ready or Not img.zip"');

    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const names = Object.keys(files).sort();
    // image #4 (index 3) is broken and skipped; numbering keeps gallery positions
    expect(names).toHaveLength(11);
    expect(names[0]).toBe("01_poster.jpg");
    expect(names).not.toContain("04_still_frame.jpg");
    expect(names.at(-1)).toBe("12_still_frame.jpg");
    expect(files["06_still_frame.jpg"][0]).toBe(5);
    expect(pagesMock).toHaveBeenCalledTimes(3);
  });

  it("starts the download after the first page, not the whole list", async () => {
    gallery(200, 5);
    const res = await GET(zipRequest());
    expect(res.status).toBe(200);
    expect(pagesMock).toHaveBeenCalledTimes(1);
    await res.body!.cancel();
  });

  it("stops working when the client cancels the download", async () => {
    gallery(500, 50);
    const res = await GET(zipRequest());
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    await sleep(100);
    const fetchedAfterCancel = imageFetches.length;
    const timers = vi.spyOn(globalThis, "setTimeout");
    await sleep(300);
    const polls = timers.mock.calls.filter(([, delay]) => delay === 50).length;
    timers.mockRestore();

    // the loop is gone: nothing polls the dead stream (a cancelled stream reports
    // desiredSize 0 forever) and no more images are pulled for it
    expect(polls).toBe(0);
    expect(imageFetches.length).toBe(fetchedAfterCancel);
    expect(fetchedAfterCancel).toBeLessThan(100);
  });

  it("frees its slot after cancelled downloads", async () => {
    gallery(500, 50);
    // only 2 archives may run at once — cancelled ones must not occupy slots
    for (let i = 0; i < 5; i++) {
      const res = await GET(zipRequest());
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await reader.read();
      await reader.cancel();
    }
  });

  it("refuses a third simultaneous archive", async () => {
    gallery(500, 50);
    const a = await GET(zipRequest());
    const b = await GET(zipRequest());
    const c = await GET(zipRequest());
    expect([a.status, b.status, c.status]).toEqual([200, 200, 503]);
    await a.body!.cancel();
    await b.body!.cancel();
    expect((await GET(zipRequest())).status).toBe(200);
  });

  it("validates the id and reports an empty gallery", async () => {
    const bad = await GET(new NextRequest("http://localhost/api/imdb/images/zip?id=x"));
    expect(bad.status).toBe(400);
    gallery(0, 5);
    expect((await GET(zipRequest())).status).toBe(404);
  });
});
