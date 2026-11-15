import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  enforceRateLimit,
  readJsonBody,
  rejectLargeBody,
  RequestBodyError,
} from "../src/lib/api-security";

test("rate limiter rejects requests above the configured window", async () => {
  const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
  const request = new NextRequest("https://awards.example.test/api/test", {
    headers: { "x-forwarded-for": ip },
  });
  const options = { name: `test-${Date.now()}`, limit: 2, windowMs: 60_000 };
  assert.equal(enforceRateLimit(request, options), null);
  assert.equal(enforceRateLimit(request, options), null);
  const response = enforceRateLimit(request, options);
  assert.equal(response?.status, 429);
  assert.equal((await response?.json()).retryAfter > 0, true);
});

test("oversized JSON requests are rejected before parsing", () => {
  const request = new NextRequest("https://awards.example.test/api/test", {
    method: "POST",
    headers: { "content-length": "9000" },
  });
  assert.equal(rejectLargeBody(request)?.status, 413);
});

test("streamed JSON is limited even without Content-Length", async () => {
  const encoder = new TextEncoder();
  const request = new NextRequest("https://awards.example.test/api/test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ value: "x".repeat(9_000) })));
        controller.close();
      },
    }),
    // Required by Node's Request implementation for streaming request bodies.
    duplex: "half",
  } as never);
  await assert.rejects(
    () => readJsonBody(request),
    (error: unknown) => error instanceof RequestBodyError && error.status === 413,
  );
});
