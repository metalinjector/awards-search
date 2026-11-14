import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AwardNotFoundError,
  fetchAndParseAward,
  parseAwardMarkdown,
  parseAwardPage,
  parseAwardUrl,
  SourceUnavailableError,
  type PageFetcher,
} from "@/lib/parser";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const HTML = fixture("award-oscar-2024.html");
const MD = fixture("award-oscar-2024.md");
const FESTIVAL_MD = fixture("award-cannes-2023.md");
const MISSING_MD = fixture("award-missing.md");
/** what r.jina.ai returns in HTML mode for a page that doesn't exist */
const EMPTY_SHELL = "<body><head></head><body></body></body>";

describe("parseAwardUrl", () => {
  it("accepts the usual spellings of an award link", () => {
    const expected = {
      slug: "oscar",
      year: 2026,
      canonicalUrl: "https://www.kinopoisk.ru/awards/oscar/2026/",
    };
    for (const url of [
      "https://www.kinopoisk.ru/awards/oscar/2026/",
      "kinopoisk.ru/awards/oscar/2026",
      "  http://kinopoisk.ru/awards/Oscar/2026/?utm=1 ",
    ]) {
      expect(parseAwardUrl(url)).toEqual(expected);
    }
  });

  it("rejects anything else", () => {
    for (const url of [
      "",
      "https://example.com/awards/oscar/2026/",
      "https://www.kinopoisk.ru/awards/oscar/",
      "https://www.kinopoisk.ru/awards/oscar/1800/",
      "https://www.kinopoisk.ru/film/301/",
    ]) {
      expect(parseAwardUrl(url)).toBeNull();
    }
  });
});

describe("parseAwardPage (HTML)", () => {
  const report = parseAwardPage(HTML, "oscar", 2024, "kinopoisk.ru");

  it("reads the award name, categories and winners", () => {
    expect(report.awardName).toBe("Оскар");
    expect(report.year).toBe(2024);
    expect(report.categories).toHaveLength(3);

    const best = report.categories[0];
    expect(best.name).toBe("Лучший фильм");
    expect(best.entries[0]).toMatchObject({
      winner: true,
      en: "Oppenheimer",
      films: [{ text: "Оппенгеймер", url: "https://www.kinopoisk.ru/film/4664634/" }],
    });
    expect(best.entries.filter((e) => e.winner)).toHaveLength(1);
    expect(best.entries.length).toBeGreaterThan(5);
  });

  it("reads the leaderboard", () => {
    expect(report.leaderboard[0]).toMatchObject({ rank: 1, filmRu: "Оппенгеймер" });
    expect(report.leaderboard[0].nominations).toBeGreaterThan(0);
  });

  it("throws when the page has no nominations", () => {
    expect(() => parseAwardPage(EMPTY_SHELL, "oscar", 2024, "x")).toThrow();
  });
});

describe("parseAwardMarkdown", () => {
  it("extracts the same data from the markdown render", () => {
    const report = parseAwardMarkdown(MD, "oscar", 2024, "md");
    expect(report.awardName).toBe("Оскар");
    expect(report.categories.length).toBeGreaterThan(20);
    const best = report.categories[0];
    expect(best.name).toBe("Лучший фильм");
    expect(best.entries[0]).toMatchObject({
      winner: true,
      en: "Oppenheimer",
      films: [{ text: "Оппенгеймер", url: "https://www.kinopoisk.ru/film/4664634/" }],
    });
    expect(best.entries.some((e) => !e.winner && e.en === "Barbie")).toBe(true);
  });
});

describe("parseAwardMarkdown — festival layout", () => {
  const report = parseAwardMarkdown(FESTIVAL_MD, "cannes", 2023, "md");
  const category = (name: string) => report.categories.find((c) => c.name === name)!;

  it("reads categories that start with an icon", () => {
    expect(report.awardName).toBe("Каннский кинофестиваль");
    expect(report.categories.map((c) => c.name).slice(0, 3)).toEqual([
      "Золотая пальмовая ветвь",
      "Гран-при жюри",
      "Приз жюри",
    ]);
  });

  it("reads the winner and the other competition entries", () => {
    const palme = category("Золотая пальмовая ветвь");
    expect(palme.entries[0]).toMatchObject({
      winner: true,
      ru: "Анатомия падения",
      en: "Anatomie d'une chute",
      films: [{ url: "https://www.kinopoisk.ru/film/4910679/" }],
    });
    expect(palme.entries.filter((e) => !e.winner).length).toBeGreaterThan(10);
  });

  it("formats “person — film” like the site does", () => {
    expect(category("Лучшая женская роль").entries[0].ru).toBe(
      "Мерве Диздар — О сухой траве",
    );
  });

  it("reads winners listed without a poster", () => {
    const students = category("Конкурс студенческих фильмов (Cinefondation)");
    expect(students.entries.filter((e) => e.winner)).toHaveLength(3);
    expect(students.entries.map((e) => e.ru)).toContain("Дыра — 2-й приз");
  });
});

describe("fetchAndParseAward — telling “absent” from “unreachable”", () => {
  /** Fake network: answers by request kind and records what was asked */
  function fakeFetcher(answers: {
    html?: string | null;
    md?: string | null;
    wayback?: string | null;
  }) {
    const calls: string[] = [];
    const fetcher: PageFetcher = async (url, headers) => {
      if (url.includes("archive.org/wayback/available")) {
        calls.push("wayback");
        return answers.wayback
          ? JSON.stringify({
              archived_snapshots: {
                closest: {
                  url: "http://web.archive.org/web/20240312000000/https://x/",
                  timestamp: "20240312000000",
                },
              },
            })
          : "{}";
      }
      if (url.includes("web.archive.org/web/")) {
        calls.push("snapshot");
        return answers.wayback ?? null;
      }
      const kind = headers["X-Return-Format"] === "html" ? "html" : "md";
      calls.push(kind);
      return answers[kind] ?? null;
    };
    return { fetcher, calls };
  }

  it("uses the HTML render when it has the data", async () => {
    const { fetcher, calls } = fakeFetcher({ html: HTML });
    const report = await fetchAndParseAward("oscar", 2024, { quick: true }, fetcher);
    expect(report.fetchedVia).toBe("kinopoisk.ru");
    expect(calls).toEqual(["html"]);
  });

  it("falls back to markdown when the HTML render is empty", async () => {
    const { fetcher } = fakeFetcher({ html: EMPTY_SHELL, md: MD });
    const report = await fetchAndParseAward("oscar", 2024, { quick: true }, fetcher);
    expect(report.fetchedVia).toBe("kinopoisk.ru (markdown)");
  });

  it("reports a redirect to the awards index as “not found”, without asking the archive", async () => {
    const { fetcher, calls } = fakeFetcher({ html: EMPTY_SHELL, md: MISSING_MD });
    await expect(
      fetchAndParseAward("kinotavr", 2024, { quick: true }, fetcher),
    ).rejects.toBeInstanceOf(AwardNotFoundError);
    expect(calls).toEqual(["html", "md"]);
  });

  it("does not call a page absent when only an unparseable markdown answered", async () => {
    // HTML request failed; markdown loaded the right page but in an unknown layout
    const odd = "Final URL: https://www.kinopoisk.ru/awards/oscar/2024/\n\nMarkdown Content:\nчто-то новое\n";
    const { fetcher } = fakeFetcher({ md: odd });
    await expect(
      fetchAndParseAward("oscar", 2024, { quick: true }, fetcher),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("calls a page absent when both renders answered and neither has nominations", async () => {
    const empty = "Final URL: https://www.kinopoisk.ru/awards/oscar/2024/\n\nMarkdown Content:\nНоминанты пока не объявлены\n";
    const { fetcher } = fakeFetcher({ html: EMPTY_SHELL, md: empty });
    await expect(
      fetchAndParseAward("oscar", 2024, { quick: true }, fetcher),
    ).rejects.toBeInstanceOf(AwardNotFoundError);
  });

  it("reports failed requests as “unavailable”, never as “not found”", async () => {
    const { fetcher, calls } = fakeFetcher({});
    await expect(
      fetchAndParseAward("oscar", 2024, { quick: true }, fetcher),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(calls).toEqual(["html", "md", "wayback"]);
  });

  it("treats a captcha page as “unavailable”", async () => {
    const captcha =
      "Title: Вы не робот?\n\nFinal URL: https://www.kinopoisk.ru/showcaptcha?retpath=x\n";
    const { fetcher } = fakeFetcher({ html: EMPTY_SHELL, md: captcha });
    await expect(
      fetchAndParseAward("oscar", 2024, { quick: true }, fetcher),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("uses a Wayback snapshot when the reader is down", async () => {
    const { fetcher } = fakeFetcher({ wayback: HTML });
    const report = await fetchAndParseAward("oscar", 2024, { quick: true }, fetcher);
    expect(report.fetchedVia).toBe("web.archive.org (снимок 20240312)");
  });

  it("retries the HTML render once in non-quick mode", async () => {
    const { fetcher, calls } = fakeFetcher({ md: MD });
    await fetchAndParseAward("oscar", 2024, {}, fetcher);
    expect(calls).toEqual(["html", "html", "md"]);
  });
});
