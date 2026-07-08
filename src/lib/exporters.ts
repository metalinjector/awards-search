import ExcelJS from "exceljs";
import type { Entry, ReportPayload } from "./types";
import type { FilmMatch } from "./search-service";
import type { ImdbAwardsPayload, ImdbNomination } from "./imdb";
import { entryFilms, entryNominee, reportStats } from "./format";

/* ---------- palette ---------- */
const C = {
  titleBg: "FF0F172A", // slate-900
  titleFg: "FFFBBF24", // amber-400
  subtitleFg: "FF94A3B8", // slate-400
  headerBg: "FF1E293B", // slate-800
  headerFg: "FFFFFFFF",
  headerAccent: "FFF59E0B", // amber-500 bottom border
  zebra: "FFF8FAFC", // slate-50
  winnerBg: "FFFEF3C7", // amber-100
  winnerFg: "FF92400E", // amber-800
  border: "FFE2E8F0", // slate-200
  link: "FF1D4ED8", // blue-700
  muted: "FF64748B", // slate-500
  statBg: "FFF1F5F9", // slate-100
};

const FONT = "Calibri";
const HEADER_ROW = 3;

type CellValue = ExcelJS.CellValue;

function link(text: string, url?: string): CellValue {
  if (!url) return text;
  return { text, hyperlink: url };
}

function thinBorders(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin", color: { argb: C.border } },
    bottom: { style: "thin", color: { argb: C.border } },
    left: { style: "thin", color: { argb: C.border } },
    right: { style: "thin", color: { argb: C.border } },
  };
}

/** Title block: row 1 — big title, row 2 — subtitle */
function addTitle(
  sheet: ExcelJS.Worksheet,
  colCount: number,
  title: string,
  subtitle: string,
): void {
  sheet.mergeCells(1, 1, 1, colCount);
  const t = sheet.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: C.titleFg } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.titleBg } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(1).height = 32;

  sheet.mergeCells(2, 1, 2, colCount);
  const s = sheet.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, italic: true, color: { argb: C.subtitleFg } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.titleBg } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2).height = 18;

  // paint title background across even if merged
  for (let i = 1; i <= colCount; i++) {
    sheet.getCell(1, i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.titleBg },
    };
    sheet.getCell(2, i).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.titleBg },
    };
  }
}

function addHeader(sheet: ExcelJS.Worksheet, headers: string[]): void {
  const row = sheet.getRow(HEADER_ROW);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.headerFg } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      bottom: { style: "medium", color: { argb: C.headerAccent } },
      top: { style: "thin", color: { argb: C.border } },
      left: { style: "thin", color: { argb: C.headerBg } },
      right: { style: "thin", color: { argb: C.headerBg } },
    };
  });
  row.height = 24;

  // filters on every sheet
  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW, column: headers.length },
  };
  sheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];
}

interface StyleOpts {
  centerCols?: number[];
  zebra?: boolean;
}

/** Base styling for a data row: font, wrap, borders, zebra */
function styleDataRow(
  row: ExcelJS.Row,
  colCount: number,
  dataIndex: number,
  opts: StyleOpts = {},
): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.font = { name: FONT, size: 11 };
    cell.alignment = {
      vertical: "top",
      wrapText: true,
      horizontal: opts.centerCols?.includes(i) ? "center" : "left",
    };
    if (opts.zebra !== false && dataIndex % 2 === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
    }
    thinBorders(cell);
    if (typeof cell.value === "object" && cell.value !== null && "hyperlink" in cell.value) {
      cell.font = {
        name: FONT,
        size: 11,
        color: { argb: C.link },
        underline: true,
      };
    }
  }
}

function highlightWinnerRow(row: ExcelJS.Row, colCount: number): void {
  for (let i = 1; i <= colCount; i++) {
    const cell = row.getCell(i);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.winnerBg } };
    const isLink =
      typeof cell.value === "object" && cell.value !== null && "hyperlink" in cell.value;
    cell.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: isLink ? C.link : C.winnerFg },
      underline: isLink,
    };
  }
}

/** Auto-fit column widths by content (measuring wrapped lines), skipping title rows */
function autofit(sheet: ExcelJS.Worksheet, caps: number[], minWidth = 6): void {
  sheet.columns.forEach((col, idx) => {
    let max = 0;
    col.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber < HEADER_ROW) return; // skip merged title block
      const text = cell.text ?? "";
      for (const line of String(text).split("\n")) {
        max = Math.max(max, line.length);
      }
    });
    const cap = caps[idx] ?? 50;
    let width = Math.max(minWidth, Math.min(max + 3, cap));
    // ExcelJS silently drops width 9 (its default), so nudge it
    if (width === 9) width = 9.5;
    col.width = width;
  });
}

function mainFilm(e: Entry): CellValue {
  if (e.films.length === 0) return entryFilms(e) || "—";
  if (e.films.length === 1) return link(e.films[0].text, e.films[0].url);
  return e.films.map((f) => f.text).join(", ");
}

function mainNominee(e: Entry): CellValue {
  if (e.people.length === 1) return link(e.people[0].text, e.people[0].url);
  if (e.people.length > 1) return e.people.map((p) => p.text).join(", ");
  // film-only category — the film is the nominee
  if (e.films.length === 1) return link(e.films[0].text, e.films[0].url);
  return entryNominee(e);
}

/* =========================================================== */

export async function buildWorkbook(payload: ReportPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kinopoisk Awards Report";
  wb.created = new Date();

  const stats = reportStats(payload);
  const subtitle = `Источник: ${payload.sourceUrl} · Категорий: ${stats.categories} · Номинаций: ${stats.total} · Наград вручено: ${stats.winners} · Сформировано: ${new Date().toLocaleDateString("ru-RU")}`;
  const titleText = `🏆 ${payload.awardName} ${payload.year}`;

  /* ---------- Sheet 1: Сводка ---------- */
  {
    const sheet = wb.addWorksheet("Сводка", {
      properties: { tabColor: { argb: C.titleBg } },
    });
    addTitle(sheet, 5, titleText, subtitle);
    addHeader(sheet, ["№", "Категория", "Победитель", "Фильм", "Номинантов"]);

    let idx = 0;
    payload.categories.forEach((cat, ci) => {
      const winners = cat.entries.filter((e) => e.winner);
      const total = cat.entries.length;
      if (winners.length === 0) {
        const row = sheet.addRow([ci + 1, cat.name, "— (не объявлен)", "—", total]);
        styleDataRow(row, 5, idx++, { centerCols: [1, 5] });
      } else {
        for (const e of winners) {
          const row = sheet.addRow([
            ci + 1,
            cat.name,
            mainNominee(e),
            mainFilm(e),
            total,
          ]);
          styleDataRow(row, 5, idx++, { centerCols: [1, 5] });
        }
      }
    });
    autofit(sheet, [6, 45, 45, 45, 12]);
  }

  /* ---------- Sheet 2: Все номинации ---------- */
  {
    const sheet = wb.addWorksheet("Все номинации", {
      properties: { tabColor: { argb: "FF2563EB" } },
    });
    addTitle(
      sheet,
      7,
      `${titleText} — все категории и все номинации`,
      subtitle,
    );
    addHeader(sheet, [
      "№",
      "Категория",
      "Статус",
      "Номинант",
      "Оригинал",
      "Фильм",
      "Итог",
    ]);

    let n = 0;
    for (const cat of payload.categories) {
      const sorted = [...cat.entries].sort(
        (a, b) => Number(b.winner) - Number(a.winner),
      );
      for (const e of sorted) {
        n += 1;
        const row = sheet.addRow([
          n,
          cat.name,
          e.winner ? "🏆 Победитель" : "Номинант",
          mainNominee(e),
          e.en || "",
          mainFilm(e),
          e.winner ? 1 : 0,
        ]);
        styleDataRow(row, 7, n - 1, { centerCols: [1, 7] });
        if (e.winner) highlightWinnerRow(row, 7);
      }
    }
    autofit(sheet, [6, 42, 16, 45, 45, 42, 8]);
  }

  /* ---------- Sheet 3: Победители ---------- */
  {
    const sheet = wb.addWorksheet("Победители", {
      properties: { tabColor: { argb: "FFD97706" } },
    });
    addTitle(sheet, 5, `${titleText} — победители по всем категориям`, subtitle);
    addHeader(sheet, ["№", "Категория", "Победитель", "Оригинал", "Фильм"]);

    let idx = 0;
    for (let ci = 0; ci < payload.categories.length; ci++) {
      const cat = payload.categories[ci];
      const winners = cat.entries.filter((e) => e.winner);
      if (winners.length === 0) {
        const row = sheet.addRow([
          ci + 1,
          cat.name,
          "— (победитель не объявлен)",
          "",
          "—",
        ]);
        styleDataRow(row, 5, idx++, { centerCols: [1], zebra: false });
        continue;
      }
      for (const e of winners) {
        const row = sheet.addRow([ci + 1, cat.name, mainNominee(e), e.en || "", mainFilm(e)]);
        styleDataRow(row, 5, idx++, { centerCols: [1], zebra: false });
        highlightWinnerRow(row, 5);
        // keep № and category readable on gold
        row.getCell(1).font = { name: FONT, size: 11, color: { argb: C.muted } };
        row.getCell(2).font = { name: FONT, size: 11, color: { argb: C.winnerFg } };
      }
    }
    autofit(sheet, [6, 45, 45, 45, 42]);
  }

  /* ---------- Sheet 4: Главные фильмы ---------- */
  if (payload.leaderboard.length > 0) {
    const sheet = wb.addWorksheet("Главные фильмы", {
      properties: { tabColor: { argb: "FF059669" } },
    });
    addTitle(sheet, 6, `${titleText} — главные фильмы года`, subtitle);
    addHeader(sheet, ["№", "Фильм", "Оригинал", "Номинации", "Победы", "Доля побед"]);

    payload.leaderboard.forEach((r, i) => {
      const share = r.nominations > 0 ? r.wins / r.nominations : 0;
      const row = sheet.addRow([
        r.rank,
        link(r.filmRu, r.filmUrl),
        r.filmEn,
        r.nominations,
        r.wins,
        share,
      ]);
      styleDataRow(row, 6, i, { centerCols: [1, 4, 5, 6] });
      row.getCell(6).numFmt = "0%";
      row.getCell(5).font = { name: FONT, size: 11, bold: true, color: { argb: C.winnerFg } };
    });
    autofit(sheet, [6, 50, 45, 12, 10, 12]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* =========================================================== */

export function buildMarkdown(payload: ReportPayload): string {
  const stats = reportStats(payload);
  const lines: string[] = [];
  const esc = (s: string) => s.replace(/\|/g, "\\|");

  lines.push(`# ${payload.awardName} ${payload.year}`);
  lines.push("");
  lines.push(`> Источник: [${payload.sourceUrl}](${payload.sourceUrl})  `);
  lines.push(
    `> Категорий: **${stats.categories}** · Номинаций: **${stats.total}** · Наград вручено: **${stats.winners}**`,
  );
  lines.push("");

  if (payload.leaderboard.length > 0) {
    lines.push(`## 🎬 Главные фильмы года`);
    lines.push("");
    lines.push(`| № | Фильм | Оригинал | Номинации | Победы |`);
    lines.push(`|---:|---|---|---:|---:|`);
    for (const r of payload.leaderboard) {
      const film = r.filmUrl ? `[${esc(r.filmRu)}](${r.filmUrl})` : esc(r.filmRu);
      lines.push(
        `| ${r.rank} | ${film} | ${esc(r.filmEn)} | ${r.nominations} | ${r.wins} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## 🏆 Победители — кратко`);
  lines.push("");
  lines.push(`| Категория | Победитель | Фильм |`);
  lines.push(`|---|---|---|`);
  for (const cat of payload.categories) {
    const wins = cat.entries.filter((e) => e.winner);
    if (wins.length === 0) {
      lines.push(`| ${esc(cat.name)} | — | — |`);
    } else {
      for (const e of wins) {
        lines.push(
          `| ${esc(cat.name)} | ${esc(entryNominee(e))} | ${esc(entryFilms(e)) || "—"} |`,
        );
      }
    }
  }
  lines.push("");

  lines.push(`## Подробно по категориям`);
  lines.push("");
  for (const cat of payload.categories) {
    lines.push(`### ${cat.name}`);
    lines.push("");
    const wins = cat.entries.filter((e) => e.winner);
    const noms = cat.entries.filter((e) => !e.winner);
    for (const e of wins) {
      const en = e.en ? ` _(${e.en})_` : "";
      lines.push(`- 🏆 **${e.ru}**${en}`);
    }
    for (const e of noms) {
      const en = e.en ? ` _(${e.en})_` : "";
      lines.push(`- ${e.ru}${en}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `_Отчёт сформирован автоматически по данным Кинопоиска (${payload.fetchedVia})._`,
  );
  lines.push("");

  /* ---------- Telegram tags ---------- */
  lines.push(`##Telegram tags`);
  lines.push("");

  lines.push(`▌ **Tags**`);
  lines.push(`🔸 #${tgTag(`${payload.awardName} ${payload.year}`)}`);
  const seenFilmTags = new Set<string>();
  for (const cat of payload.categories) {
    for (const e of cat.entries) {
      if (!e.winner) continue;
      for (const f of e.films) {
        const tag = tgTag(f.text);
        if (!tag || seenFilmTags.has(tag)) continue;
        seenFilmTags.add(tag);
        lines.push(`🔹 #${tag}`);
      }
    }
  }
  lines.push("");

  const seenPersonTags = new Set<string>();
  const personTags: string[] = [];
  for (const cat of payload.categories) {
    for (const e of cat.entries) {
      if (!e.winner) continue;
      for (const p of e.people) {
        const tag = tgPersonTag(p.text);
        if (!tag || seenPersonTags.has(tag)) continue;
        seenPersonTags.add(tag);
        personTags.push(`#${tag}`);
      }
    }
  }
  if (personTags.length > 0) {
    lines.push(`▌ **Persons**`);
    lines.push(personTags.join(" "));
    lines.push("");
  }

  lines.push(`▌ **Name**: ${payload.awardName}`);
  lines.push("");
  lines.push(`▌ **Year**: ${payload.year}`);
  lines.push("");

  return lines.join("\n");
}

/* =========================================================== */
/*                Film search results export                    */
/* =========================================================== */

function matchNominee(m: FilmMatch): CellValue {
  const e = m.entry;
  if (e.people.length === 1) return link(e.people[0].text, e.people[0].url);
  if (e.people.length > 1) return e.people.map((p) => p.text).join(", ");
  if (e.films.length === 1) return link(e.films[0].text, e.films[0].url);
  return e.ru;
}

interface FilmGroup {
  slug: string;
  awardName: string;
  year: number;
  sourceUrl: string;
  items: FilmMatch[];
}

function groupMatches(matches: FilmMatch[]): FilmGroup[] {
  const groups: FilmGroup[] = [];
  for (const m of matches) {
    let g = groups.find(
      (x) => x.slug === m.awardSlug && x.year === m.awardYear,
    );
    if (!g) {
      g = {
        slug: m.awardSlug,
        awardName: m.awardName,
        year: m.awardYear,
        sourceUrl: m.sourceUrl,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(m);
  }
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.entry.winner) - Number(a.entry.winner));
  }
  return groups;
}

export async function buildFilmWorkbook(
  query: string,
  filmYear: number,
  matches: FilmMatch[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kinopoisk Awards Report";
  wb.created = new Date();

  const wins = matches.filter((m) => m.entry.winner);
  const groups = groupMatches(matches);
  const titleText = `🎞️ «${query}» (${filmYear}) — награды и номинации`;
  const subtitle = `Премии ${filmYear}–${filmYear + 2} годов · Побед: ${wins.length} · Номинаций: ${matches.length} · Премий/фестивалей: ${groups.length} · Сформировано: ${new Date().toLocaleDateString("ru-RU")} · Данные: kinopoisk.ru`;

  /* ---------- Sheet 1: Победы ---------- */
  {
    const sheet = wb.addWorksheet("Победы", {
      properties: { tabColor: { argb: "FFD97706" } },
    });
    addTitle(sheet, 5, titleText, subtitle);
    addHeader(sheet, ["№", "Премия", "Год", "Категория", "Лауреат"]);

    if (wins.length === 0) {
      const row = sheet.addRow([
        "—",
        "Побед не найдено",
        "",
        "",
        "",
      ]);
      styleDataRow(row, 5, 0, { zebra: false });
    }
    wins.forEach((m, i) => {
      const row = sheet.addRow([
        i + 1,
        link(m.awardName, m.sourceUrl),
        m.awardYear,
        m.category,
        matchNominee(m),
      ]);
      styleDataRow(row, 5, i, { centerCols: [1, 3], zebra: false });
      highlightWinnerRow(row, 5);
      row.getCell(1).font = { name: FONT, size: 11, color: { argb: C.muted } };
    });
    autofit(sheet, [6, 32, 8, 45, 45]);
  }

  /* ---------- Sheet 2: Все номинации ---------- */
  {
    const sheet = wb.addWorksheet("Все номинации", {
      properties: { tabColor: { argb: "FF2563EB" } },
    });
    addTitle(sheet, 8, titleText, subtitle);
    addHeader(sheet, [
      "№",
      "Премия",
      "Год",
      "Категория",
      "Статус",
      "Номинант",
      "Оригинал",
      "Итог",
    ]);

    let n = 0;
    for (const g of groups) {
      for (const m of g.items) {
        n += 1;
        const row = sheet.addRow([
          n,
          m.awardName,
          m.awardYear,
          m.category,
          m.entry.winner ? "🏆 Победа" : "Номинация",
          matchNominee(m),
          m.entry.en || "",
          m.entry.winner ? 1 : 0,
        ]);
        styleDataRow(row, 8, n - 1, { centerCols: [1, 3, 8] });
        if (m.entry.winner) highlightWinnerRow(row, 8);
      }
    }
    autofit(sheet, [6, 32, 8, 42, 14, 45, 45, 8]);
  }

  /* ---------- Sheet 3: По премиям (сводка) ---------- */
  {
    const sheet = wb.addWorksheet("По премиям", {
      properties: { tabColor: { argb: "FF059669" } },
    });
    addTitle(sheet, 6, titleText, subtitle);
    addHeader(sheet, [
      "№",
      "Премия",
      "Год",
      "Номинаций",
      "Побед",
      "Категории побед",
    ]);

    groups.forEach((g, i) => {
      const gWins = g.items.filter((m) => m.entry.winner);
      const row = sheet.addRow([
        i + 1,
        link(g.awardName, g.sourceUrl),
        g.year,
        g.items.length,
        gWins.length,
        gWins.map((m) => m.category).join("\n") || "—",
      ]);
      styleDataRow(row, 6, i, { centerCols: [1, 3, 4, 5] });
      if (gWins.length > 0) {
        row.getCell(5).font = {
          name: FONT,
          size: 11,
          bold: true,
          color: { argb: C.winnerFg },
        };
      }
    });
    autofit(sheet, [6, 32, 8, 12, 10, 50]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildFilmMarkdown(
  query: string,
  filmYear: number,
  matches: FilmMatch[],
): string {
  const lines: string[] = [];
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const wins = matches.filter((m) => m.entry.winner);
  const groups = groupMatches(matches);

  lines.push(`# «${query}» (${filmYear}) — награды и номинации`);
  lines.push("");
  lines.push(
    `> Сканирование премий Кинопоиска за ${filmYear}–${filmYear + 2} годы  `,
  );
  lines.push(
    `> Побед: **${wins.length}** · Номинаций: **${matches.length}** · Премий/фестивалей: **${groups.length}**`,
  );
  lines.push("");

  if (wins.length > 0) {
    lines.push(`## 🏆 Победы`);
    lines.push("");
    lines.push(`| Премия | Год | Категория | Лауреат |`);
    lines.push(`|---|---:|---|---|`);
    for (const m of wins) {
      const nominee =
        m.entry.people.length > 0
          ? m.entry.people.map((p) => p.text).join(", ")
          : esc(query);
      lines.push(
        `| [${esc(m.awardName)}](${m.sourceUrl}) | ${m.awardYear} | ${esc(m.category)} | ${esc(nominee)} |`,
      );
    }
    lines.push("");
  }

  if (matches.length > 0) {
    lines.push(`## Все номинации по премиям`);
    lines.push("");
    for (const g of groups) {
      const gWins = g.items.filter((m) => m.entry.winner).length;
      const badge = gWins > 0 ? ` — 🏆 ${gWins}` : "";
      lines.push(`### [${g.awardName} ${g.year}](${g.sourceUrl})${badge}`);
      lines.push("");
      for (const m of g.items) {
        const en = m.entry.en ? ` _(${m.entry.en})_` : "";
        if (m.entry.winner) {
          lines.push(`- 🏆 **${m.category}** — **${m.entry.ru}**${en} — ПОБЕДА`);
        } else {
          lines.push(`- ${m.category} — ${m.entry.ru}${en}`);
        }
      }
      lines.push("");
    }
  } else {
    lines.push(`_По запросу ничего не найдено._`);
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `_Отчёт сформирован автоматически по данным Кинопоиска (kinopoisk.ru/awards)._`,
  );
  lines.push("");

  /* ---------- Telegram tags ---------- */
  lines.push(`##Telegram tags`);
  lines.push("");

  lines.push(`▌ **Tags**`);
  const seenEventTags = new Set<string>();
  for (const g of groups) {
    const tag = tgTag(`${g.awardName} ${g.year}`);
    if (!tag || seenEventTags.has(tag)) continue;
    seenEventTags.add(tag);
    const hasWin = g.items.some((m) => m.entry.winner);
    lines.push(hasWin ? `🔸 #${tag}` : `🔹 #${tag}`);
  }
  lines.push("");

  const seenPersonTags = new Set<string>();
  const personTags: string[] = [];
  const orderedMatches = [...wins, ...matches.filter((m) => !m.entry.winner)];
  for (const m of orderedMatches) {
    for (const p of m.entry.people) {
      const tag = tgPersonTag(p.text);
      if (!tag || seenPersonTags.has(tag)) continue;
      seenPersonTags.add(tag);
      personTags.push(`#${tag}`);
    }
  }
  if (personTags.length > 0) {
    lines.push(`▌ **Persons**`);
    lines.push(personTags.join(" "));
    lines.push("");
  }

  lines.push(`▌ **Name**: ${query}`);
  lines.push("");
  lines.push(`▌ **Year**: ${filmYear}`);
  lines.push("");

  return lines.join("\n");
}

/* =========================================================== */
/*                    IMDb awards export                        */
/* =========================================================== */

interface ImdbGroup {
  eventId: string;
  eventName: string;
  year?: number;
  items: ImdbNomination[];
}

function groupImdb(nominations: ImdbNomination[]): ImdbGroup[] {
  const groups: ImdbGroup[] = [];
  for (const n of nominations) {
    let g = groups.find((x) => x.eventId === n.eventId && x.year === n.year);
    if (!g) {
      g = { eventId: n.eventId, eventName: n.eventName, year: n.year, items: [] };
      groups.push(g);
    }
    g.items.push(n);
  }
  for (const g of groups) {
    g.items.sort((a, b) => Number(b.isWinner) - Number(a.isWinner));
  }
  groups.sort(
    (a, b) =>
      (b.items.filter((i) => i.isWinner).length -
        a.items.filter((i) => i.isWinner).length) ||
      b.items.length - a.items.length,
  );
  return groups;
}

function imdbEventUrl(g: { eventId: string; year?: number }): string | undefined {
  if (!g.eventId) return undefined;
  return `https://www.imdb.com/event/${g.eventId}/${g.year ?? ""}`;
}

export async function buildImdbWorkbook(payload: ImdbAwardsPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "IMDb Awards Report";
  wb.created = new Date();

  const { title, stats, nominations } = payload;
  const wins = nominations.filter((n) => n.isWinner);
  const groups = groupImdb(nominations);
  const titleText = `🎬 ${title.title}${title.year ? ` (${title.year})` : ""} — IMDb awards`;
  const subtitle = `imdb.com/title/${title.id}/awards · Побед: ${stats.winCount} · Номинаций: ${stats.nominationCount} · Событий: ${groups.length} · Сформировано: ${new Date().toLocaleDateString("ru-RU")}`;

  /* Sheet 1: Победы */
  {
    const sheet = wb.addWorksheet("Победы", {
      properties: { tabColor: { argb: "FFD97706" } },
    });
    addTitle(sheet, 6, titleText, subtitle);
    addHeader(sheet, ["№", "Событие", "Год", "Награда", "Категория", "Лауреаты"]);
    wins.forEach((n, i) => {
      const row = sheet.addRow([
        i + 1,
        link(n.eventName, imdbEventUrl(n)),
        n.year ?? "",
        n.awardText ?? "",
        n.category ?? "",
        n.nominees.map((p) => p.name).join(", "),
      ]);
      styleDataRow(row, 6, i, { centerCols: [1, 3], zebra: false });
      highlightWinnerRow(row, 6);
      row.getCell(1).font = { name: FONT, size: 11, color: { argb: C.muted } };
    });
    autofit(sheet, [6, 38, 8, 26, 42, 45]);
  }

  /* Sheet 2: Все номинации */
  {
    const sheet = wb.addWorksheet("Все номинации", {
      properties: { tabColor: { argb: "FF2563EB" } },
    });
    addTitle(sheet, 8, titleText, subtitle);
    addHeader(sheet, [
      "№",
      "Событие",
      "Год",
      "Награда",
      "Категория",
      "Статус",
      "Номинанты",
      "Итог",
    ]);
    let i = 0;
    for (const g of groups) {
      for (const n of g.items) {
        i += 1;
        const row = sheet.addRow([
          i,
          n.eventName,
          n.year ?? "",
          n.awardText ?? "",
          n.category ?? "",
          n.isWinner ? "🏆 Победа" : "Номинация",
          n.nominees.map((p) => p.name).join(", "),
          n.isWinner ? 1 : 0,
        ]);
        styleDataRow(row, 8, i - 1, { centerCols: [1, 3, 8] });
        if (n.isWinner) highlightWinnerRow(row, 8);
      }
    }
    autofit(sheet, [6, 38, 8, 26, 42, 13, 45, 8]);
  }

  /* Sheet 3: По событиям */
  {
    const sheet = wb.addWorksheet("По событиям", {
      properties: { tabColor: { argb: "FF059669" } },
    });
    addTitle(sheet, 6, titleText, subtitle);
    addHeader(sheet, ["№", "Событие", "Год", "Номинаций", "Побед", "Категории побед"]);
    groups.forEach((g, i) => {
      const gw = g.items.filter((n) => n.isWinner);
      const row = sheet.addRow([
        i + 1,
        link(g.eventName, imdbEventUrl(g)),
        g.year ?? "",
        g.items.length,
        gw.length,
        gw.map((n) => n.category ?? n.awardText ?? "").filter(Boolean).join("\n") || "—",
      ]);
      styleDataRow(row, 6, i, { centerCols: [1, 3, 4, 5] });
      if (gw.length > 0) {
        row.getCell(5).font = {
          name: FONT,
          size: 11,
          bold: true,
          color: { argb: C.winnerFg },
        };
      }
    });
    autofit(sheet, [6, 40, 8, 12, 10, 55]);
  }

  /* Sheet 4: Персоны */
  {
    const byPerson = new Map<string, { name: string; id?: string; noms: number; wins: number; cats: string[] }>();
    for (const n of nominations) {
      for (const p of n.nominees) {
        const key = p.id ?? p.name;
        const rec = byPerson.get(key) ?? { name: p.name, id: p.id, noms: 0, wins: 0, cats: [] };
        rec.noms += 1;
        if (n.isWinner) {
          rec.wins += 1;
          const cat = `${n.eventName}${n.year ? ` ${n.year}` : ""}: ${n.category ?? n.awardText ?? ""}`;
          if (rec.cats.length < 12) rec.cats.push(cat);
        }
        byPerson.set(key, rec);
      }
    }
    const persons = [...byPerson.values()].sort(
      (a, b) => b.wins - a.wins || b.noms - a.noms,
    );
    if (persons.length > 0) {
      const sheet = wb.addWorksheet("Персоны", {
        properties: { tabColor: { argb: "FF7C3AED" } },
      });
      addTitle(sheet, 5, titleText, subtitle);
      addHeader(sheet, ["№", "Персона", "Номинаций", "Побед", "Победы (события)"]);
      persons.forEach((p, i) => {
        const row = sheet.addRow([
          i + 1,
          p.id ? link(p.name, `https://www.imdb.com/name/${p.id}/`) : p.name,
          p.noms,
          p.wins,
          p.cats.join("\n") || "—",
        ]);
        styleDataRow(row, 5, i, { centerCols: [1, 3, 4] });
        if (p.wins > 0) {
          row.getCell(4).font = {
            name: FONT,
            size: 11,
            bold: true,
            color: { argb: C.winnerFg },
          };
        }
      });
      autofit(sheet, [6, 34, 12, 10, 60]);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Telegram-safe hashtag: only letters, digits and underscores */
function tgTag(s: string): string {
  return s
    .replace(/['’`]/g, "") // People's -> Peoples
    .replace(/[^\p{L}\p{N}]+/gu, " ") // punctuation -> space
    .trim()
    .replace(/\s+/g, "_");
}

/** Well-known event aliases: prepend the common award name to the tag */
const TG_EVENT_PREFIXES: Array<{ match: RegExp; prefix: string }> = [
  { match: /^Academy_Awards_USA/i, prefix: "Oscar_" },
  // IMDb calls Screen Actors Guild Awards just "Actor Awards" (ev0000598)
  { match: /^Actor_Awards/i, prefix: "SAG_" },
];

/** Event hashtag with alias prefixes: Academy Awards, USA 2025 -> Oscar_Academy_Awards_USA_2025 */
function tgEventTag(name: string, year?: number): string {
  let tag = tgTag(`${name}${year ? ` ${year}` : ""}`);
  for (const { match, prefix } of TG_EVENT_PREFIXES) {
    if (match.test(tag)) {
      tag = prefix + tag;
      break;
    }
  }
  return tag;
}

/** CamelCase person tag: Tom Hardy -> #TomHardy */
function tgPersonTag(name: string): string {
  return name
    .replace(/['’`]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

export function buildImdbMarkdown(payload: ImdbAwardsPayload): string {
  const { title, stats, nominations } = payload;
  const wins = nominations.filter((n) => n.isWinner);
  const groups = groupImdb(nominations);
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const lines: string[] = [];

  lines.push(`# ${title.title}${title.year ? ` (${title.year})` : ""} — награды IMDb`);
  lines.push("");
  lines.push(
    `> Источник: [imdb.com/title/${title.id}/awards](https://www.imdb.com/title/${title.id}/awards/)  `,
  );
  lines.push(
    `> Побед: **${stats.winCount}** · Номинаций: **${stats.nominationCount}** · Событий: **${groups.length}**${title.rating ? ` · Рейтинг IMDb: **${title.rating}**` : ""}`,
  );
  lines.push("");

  if (wins.length > 0) {
    lines.push(`## 🏆 Победы (${wins.length})`);
    lines.push("");
    lines.push(`| Событие | Год | Награда | Категория | Лауреаты |`);
    lines.push(`|---|---:|---|---|---|`);
    for (const n of wins) {
      const url = imdbEventUrl(n);
      const ev = url ? `[${esc(n.eventName)}](${url})` : esc(n.eventName);
      lines.push(
        `| ${ev} | ${n.year ?? ""} | ${esc(n.awardText ?? "")} | ${esc(n.category ?? "")} | ${esc(n.nominees.map((p) => p.name).join(", "))} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## Все номинации по событиям`);
  lines.push("");
  for (const g of groups) {
    const gw = g.items.filter((n) => n.isWinner).length;
    const badge = gw > 0 ? ` — 🏆 ${gw}` : "";
    const url = imdbEventUrl(g);
    const head = url
      ? `[${g.eventName}${g.year ? ` ${g.year}` : ""}](${url})`
      : `${g.eventName}${g.year ? ` ${g.year}` : ""}`;
    lines.push(`### ${head}${badge}`);
    lines.push("");
    for (const n of g.items) {
      const who = n.nominees.map((p) => p.name).join(", ");
      const cat = [n.awardText, n.category].filter(Boolean).join(" · ");
      if (n.isWinner) {
        lines.push(`- 🏆 **${cat}**${who ? ` — **${who}**` : ""} — ПОБЕДА`);
      } else {
        lines.push(`- ${cat}${who ? ` — ${who}` : ""}`);
      }
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`_Отчёт сформирован автоматически по данным IMDb._`);
  lines.push("");

  /* ---------- Telegram tags ---------- */
  lines.push(`##Telegram tags`);
  lines.push("");

  // Tags: one hashtag per event edition, 🔸 = event with a win, 🔹 = nominations only
  lines.push(`▌ **Tags**`);
  const seenTags = new Set<string>();
  for (const g of groups) {
    const tag = tgEventTag(g.eventName, g.year);
    if (!tag || seenTags.has(tag)) continue;
    seenTags.add(tag);
    const hasWin = g.items.some((n) => n.isWinner);
    lines.push(hasWin ? `🔸 #${tag}` : `🔹 #${tag}`);
  }
  lines.push("");

  // Persons: director(s) first, then film stars, deduplicated CamelCase hashtags
  const stars = title.stars ?? [];
  const directors = title.directors ?? [];
  const personTags: string[] = [];
  const seenPersons = new Set<string>();
  for (const p of [...directors, ...stars]) {
    const tag = tgPersonTag(p.name);
    if (!tag || seenPersons.has(tag)) continue;
    seenPersons.add(tag);
    personTags.push(`#${tag}`);
  }
  if (personTags.length > 0) {
    lines.push(`▌ **Persons**`);
    lines.push(personTags.join(" "));
    lines.push("");
  }

  // Name: title without year (year has its own block)
  lines.push(`▌ **Name**: ${title.title}`);
  lines.push("");

  // Year
  if (title.year) {
    lines.push(`▌ **Year**: ${title.year}`);
    lines.push("");
  }

  // Storiline: plot
  if (title.plot) {
    lines.push(`▌ **Storiline**`);
    lines.push(title.plot);
    lines.push("");
  }

  // Cast: director / writers / stars
  const writers = title.writers ?? [];
  if (directors.length > 0 || writers.length > 0 || stars.length > 0) {
    lines.push(`▌ **Cast**`);
    if (directors.length > 0) {
      lines.push(
        `**${directors.length > 1 ? "Directors" : "Director"}**: ${directors.map((p) => p.name).join(", ")}`,
      );
    }
    if (writers.length > 0) {
      lines.push(
        `**${writers.length > 1 ? "Writers" : "Writer"}**: ${writers.map((p) => p.name).join(", ")}`,
      );
    }
    if (stars.length > 0) {
      lines.push(`**Stars**: ${stars.map((p) => p.name).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
