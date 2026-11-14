import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentDisposition, parseKpId, parseYear, safeFileName } from "@/lib/api";
import { dedupe } from "@/lib/inflight";
import { groupImdbNominations } from "@/lib/imdb-group";
import type { ImdbNomination } from "@/lib/imdb";
import { parseKpSearchMarkdown } from "@/lib/kp-suggest";
import { checkRate, clientIp } from "@/lib/rate-limit";

describe("parseKpSearchMarkdown", () => {
  const items = parseKpSearchMarkdown(
    fs.readFileSync(path.join(__dirname, "fixtures", "kp-search.md"), "utf8"),
  );

  it("reads the film cards of a Kinopoisk search page", () => {
    expect(items.length).toBeGreaterThan(3);
    expect(items[0]).toMatchObject({
      kpId: "301",
      title: "Матрица",
      year: 1999,
      originalTitle: "The Matrix",
      director: "Лана Вачовски",
      rating: "8.5",
      genres: "фантастика, боевик",
    });
  });

  it("lists every film once", () => {
    const ids = items.map((i) => i.kpId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("request parameter helpers", () => {
  it("parseYear accepts only 1900–2100", () => {
    expect(parseYear("2024")).toBe(2024);
    expect(parseYear(1999)).toBe(1999);
    for (const bad of ["", "abc", "1899", "2101", null, undefined, 2024.5]) {
      expect(parseYear(bad)).toBeNull();
    }
  });

  it("parseKpId accepts digits only", () => {
    expect(parseKpId(" 301 ")).toBe("301");
    expect(parseKpId("301/../x")).toBeUndefined();
    expect(parseKpId(null)).toBeUndefined();
  });

  it("safeFileName strips characters that are invalid in file names", () => {
    expect(safeFileName('Что/если: "да"?')).toBe("Чтоесли да");
    expect(safeFileName("  ///  ", "film")).toBe("film");
    expect(safeFileName("a".repeat(100)).length).toBe(60);
  });

  it("contentDisposition carries an ASCII fallback and the UTF-8 name", () => {
    expect(contentDisposition("Оскар (2024).xlsx")).toBe(
      "attachment; filename=\"_____ (2024).xlsx\"; filename*=UTF-8''%D0%9E%D1%81%D0%BA%D0%B0%D1%80%20%282024%29.xlsx",
    );
  });
});

describe("rate limiter", () => {
  it("allows `limit` requests per window, then recovers", () => {
    const key = `test:${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(checkRate(key, 3, 1000, t0).ok).toBe(true);
    const blocked = checkRate(key, 3, 1000, t0 + 400);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(checkRate(key, 3, 1000, t0 + 1001).ok).toBe(true);
  });

  it("takes the address appended by our own proxy, not a client-supplied one", () => {
    const h = (v: Record<string, string>) => new Headers(v);
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(h({}))).toBe("unknown");
  });
});

describe("dedupe", () => {
  it("shares one in-flight call between concurrent callers", async () => {
    let calls = 0;
    const work = () =>
      dedupe("k", async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return calls;
      });
    expect(await Promise.all([work(), work(), work()])).toEqual([1, 1, 1]);
    expect(await work()).toBe(2); // finished work is not cached
  });

  it("does not keep a failed call around", async () => {
    await expect(dedupe("f", () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await dedupe("f", async () => "ok")).toBe("ok");
  });
});

describe("groupImdbNominations", () => {
  const nom = (eventId: string, year: number, isWinner: boolean): ImdbNomination => ({
    eventId,
    eventName: eventId,
    year,
    isWinner,
    nominees: [],
  });

  it("groups by ceremony, most successful first, winners on top", () => {
    const groups = groupImdbNominations([
      nom("ev1", 2024, false),
      nom("ev2", 2024, false),
      nom("ev2", 2024, true),
      nom("ev1", 2025, false),
      nom("ev1", 2024, false),
    ]);
    expect(groups.map((g) => `${g.eventId}:${g.year}:${g.items.length}`)).toEqual([
      "ev2:2024:2",
      "ev1:2024:2",
      "ev1:2025:1",
    ]);
    expect(groups[0].items[0].isWinner).toBe(true);
  });
});
