// ZIP gallery route and IMDb pagination against a fake IMDb (globalThis.fetch).
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/imdb/images/zip/route";
import { fetchImdbAwards } from "../src/lib/imdb";
import { externalQueueSnapshot } from "../src/lib/work-queue";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const PAGES = 3;
const PER_PAGE = 4;
let calls: { images: number; title: number; awards: number };

/** Fake IMDb: a gallery of PAGES×PER_PAGE images; awards page 2 fails when asked to */
function fakeImdb(opts: { failAwardsPage2?: boolean } = {}) {
  calls = { images: 0, title: 0, awards: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.graphql.imdb.com")) {
      const { query, variables } = JSON.parse(String(init?.body));
      if (query.includes("query TitleImages")) {
        calls.images += 1;
        const page = variables.after ? Number(variables.after) : 0;
        return Response.json({
          data: {
            title: {
              images: {
                total: PAGES * PER_PAGE,
                pageInfo: { hasNextPage: page + 1 < PAGES, endCursor: String(page + 1) },
                edges: Array.from({ length: PER_PAGE }, (_, i) => ({
                  node: { url: `https://m.media-amazon.com/images/${page}-${i}.jpg`, type: "still_frame" },
                })),
              },
            },
          },
        });
      }
      if (query.includes("query OfficialTitle")) {
        calls.title += 1;
        return Response.json({ data: { title: { titleText: { text: "Film: Test" } } } });
      }
      if (query.includes("query TitleAwards")) {
        calls.awards += 1;
        const page = variables.after ? Number(variables.after) : 0;
        if (page === 1 && opts.failAwardsPage2) {
          return Response.json({ errors: [{ message: "bad request" }] }, { status: 400 });
        }
        return Response.json({
          data: {
            title: {
              id: "tt1234567",
              titleText: { text: "Film" },
              nominations: {
                total: 4,
                pageInfo: { hasNextPage: page === 0, endCursor: "1" },
                edges: [0, 1].map((i) => ({
                  node: {
                    id: `n${page}-${i}`,
                    event: { id: "ev1", name: { text: "Event" } },
                    eventEdition: { year: 2024 },
                    category: { text: "Best" },
                    isWinner: i === 0,
                  },
                })),
              },
            },
          },
        });
      }
    }
    if (url.startsWith("https://m.media-amazon.com/")) {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), {
        headers: { "content-type": "image/jpeg" },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

let ipCounter = 0;
const zipRequest = (id = "tt1234567", ip = `198.51.100.${++ipCounter}`) =>
  new NextRequest(`https://awards.example.test/api/imdb/images/zip?id=${id}`, {
    headers: { "x-forwarded-for": ip },
  });

/** File names inside a stored (uncompressed) ZIP */
function zipEntries(buf: Uint8Array): string[] {
  const names: string[] = [];
  for (let i = 0; i + 46 <= buf.length; i++) {
    // central directory header "PK\x01\x02"
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 1 && buf[i + 3] === 2) {
      const len = buf[i + 28] | (buf[i + 29] << 8);
      names.push(new TextDecoder().decode(buf.subarray(i + 46, i + 46 + len)));
    }
  }
  return names;
}

test("ZIP: every image of every page ends up in the archive", async () => {
  fakeImdb();
  const res = await GET(zipRequest());
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-disposition") ?? "", /Film Test img\.zip/);
  const names = zipEntries(new Uint8Array(await res.arrayBuffer()));
  assert.equal(names.length, PAGES * PER_PAGE);
  assert.equal(names[0], "01_still_frame.jpg");
});

test("ZIP: the slot is freed after a completed download (no 503 on the third one)", async () => {
  fakeImdb();
  for (let n = 0; n < 3; n++) {
    const res = await GET(zipRequest());
    assert.equal(res.status, 200, `download #${n + 1}`);
    await res.arrayBuffer();
    assert.deepEqual(externalQueueSnapshot().leases, {});
  }
});

test("ZIP: the slot is freed after the client cancels", async () => {
  fakeImdb();
  const res = await GET(zipRequest());
  const reader = res.body!.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(externalQueueSnapshot().leases, {});
});

test("ZIP: the download starts after the first gallery page, not the whole list", async () => {
  fakeImdb();
  const res = await GET(zipRequest());
  assert.equal(res.status, 200);
  assert.equal(calls.images, 1);
  await res.arrayBuffer();
  assert.equal(calls.images, PAGES);
});

test("ZIP: a third simultaneous archive is refused", async () => {
  fakeImdb();
  const first = await GET(zipRequest());
  const second = await GET(zipRequest());
  const third = await GET(zipRequest());
  assert.deepEqual([first.status, second.status, third.status], [200, 200, 503]);
  await first.arrayBuffer();
  await second.arrayBuffer();
  assert.deepEqual(externalQueueSnapshot().leases, {});
});

test("ZIP: a bad id is rejected without spending the rate limit", async () => {
  fakeImdb();
  const ip = "203.0.113.7";
  for (let n = 0; n < 3; n++) {
    assert.equal((await GET(zipRequest("nope", ip))).status, 400);
  }
  const ok = await GET(zipRequest("tt1234567", ip));
  assert.equal(ok.status, 200);
  await ok.arrayBuffer();
});

test("IMDb awards: complete result when every page answers", async () => {
  fakeImdb();
  const payload = await fetchImdbAwards("tt1234567");
  assert.equal(payload.partial, undefined);
  assert.equal(payload.nominations.length, 4);
});

test("IMDb awards: a failure after the first page gives a flagged partial result", async () => {
  fakeImdb({ failAwardsPage2: true });
  const payload = await fetchImdbAwards("tt1234567");
  assert.equal(payload.partial, true);
  assert.equal(payload.nominations.length, 2);
  assert.equal(payload.stats.winCount + payload.stats.nominationCount, 4);
});
