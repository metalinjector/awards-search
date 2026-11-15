import type { ReportPayload } from "./types";
import type { FilmMatch } from "./search-service";
import type { ImdbAwardsPayload, ImdbNomination } from "./imdb";
import { entryNominee, entryFilms, reportStats } from "./format";
import { groupImdbNominations } from "./imdb-group";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:linear-gradient(180deg,#020617,#0f172a 40%,#020617);color:#e2e8f0;min-height:100vh;padding:32px 16px}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:28px;color:#fff;margin-bottom:6px}
h1 .accent{background:linear-gradient(90deg,#fcd34d,#fb923c);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#64748b;font-size:13px;margin-bottom:20px}
.sub a{color:#94a3b8}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:24px}
.stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 18px;text-align:center}
.stat b{display:block;font-size:22px;color:#fcd34d}
.stat span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b}
section{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:16px;margin-bottom:16px;overflow:hidden}
section>h2{font-size:16px;color:#fcd34d;padding:12px 18px;background:linear-gradient(90deg,rgba(245,158,11,.15),transparent);border-bottom:1px solid rgba(255,255,255,.08)}
section>h2 .cnt{color:#64748b;font-weight:400;font-size:12px;margin-left:8px}
section>h2 a{color:inherit;text-decoration:none}
.row{display:flex;gap:12px;padding:10px 18px;border-top:1px solid rgba(255,255,255,.04);align-items:flex-start}
.row:first-of-type{border-top:none}
.row.win{background:rgba(245,158,11,.1)}
.row .ico{width:24px;flex:none;text-align:center}
.row .main{color:#e2e8f0}
.row.win .main{color:#fde68a;font-weight:600}
.row .en{font-size:12.5px;color:#64748b;margin-top:2px}
.row a{color:inherit;text-decoration:underline;text-decoration-color:rgba(255,255,255,.25);text-underline-offset:2px}
.row a:hover{color:#fcd34d}
.badge{display:inline-block;background:rgba(245,158,11,.2);color:#fcd34d;border-radius:999px;font-size:10.5px;font-weight:700;padding:2px 8px;margin-left:8px;vertical-align:1px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;padding:9px 14px;background:rgba(255,255,255,.05);color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.07em}
td{padding:9px 14px;border-top:1px solid rgba(255,255,255,.05);vertical-align:top}
tr.win td{background:rgba(245,158,11,.1);color:#fde68a;font-weight:600}
td a{color:inherit}
.poster{width:110px;border-radius:10px;float:right;margin:0 0 12px 16px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border-radius:999px;padding:2px 10px 2px 3px;font-size:12px;color:#cbd5e1;text-decoration:none}
.chip img{width:20px;height:20px;border-radius:50%;object-fit:cover}
.chip:hover{color:#fcd34d}
footer{color:#475569;font-size:11.5px;text-align:center;margin-top:28px}
@media print{body{background:#fff;color:#111}section{border-color:#ddd;background:#fff}.row.win{background:#fef3c7}}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body><div class="wrap">
${body}
<footer>Отчёт сформирован автоматически · ${new Date().toLocaleDateString("ru-RU")}</footer>
</div></body>
</html>`;
}

/* ------------------- Kinopoisk award report ------------------- */

export function buildReportHtml(payload: ReportPayload): string {
  const stats = reportStats(payload);
  const parts: string[] = [];

  parts.push(
    `<h1><span class="accent">${esc(payload.awardName)}</span> ${payload.year}</h1>`,
  );
  parts.push(
    `<div class="sub">Источник: <a href="${esc(payload.sourceUrl)}">${esc(
      payload.sourceUrl.replace("https://www.", ""),
    )}</a></div>`,
  );
  parts.push(
    `<div class="stats">
      <div class="stat"><b>${stats.categories}</b><span>категорий</span></div>
      <div class="stat"><b>${stats.total}</b><span>номинаций</span></div>
      <div class="stat"><b>${stats.winners}</b><span>наград вручено</span></div>
      <div class="stat"><b>${stats.films}</b><span>фильмов</span></div>
    </div>`,
  );

  if (payload.leaderboard.length > 0) {
    const rows = payload.leaderboard
      .map(
        (r) =>
          `<tr><td>${r.rank}</td><td>${
            r.filmUrl ? `<a href="${esc(r.filmUrl)}">${esc(r.filmRu)}</a>` : esc(r.filmRu)
          }${r.filmEn ? `<div class="en">${esc(r.filmEn)}</div>` : ""}</td><td>${r.nominations}</td><td><b style="color:#fcd34d">${r.wins}</b></td></tr>`,
      )
      .join("");
    parts.push(
      `<section><h2>🎬 Главные фильмы года</h2><table><tr><th>№</th><th>Фильм</th><th>Номинации</th><th>Победы</th></tr>${rows}</table></section>`,
    );
  }

  for (const cat of payload.categories) {
    const rows = [...cat.entries]
      .sort((a, b) => Number(b.winner) - Number(a.winner))
      .map((e) => {
        const links: string[] = [];
        for (const p of e.people)
          links.push(`<a href="${esc(p.url)}">${esc(p.text)}</a>`);
        const films: string[] = [];
        for (const f of e.films)
          films.push(`<a href="${esc(f.url)}">${esc(f.text)}</a>`);
        let main = "";
        if (links.length > 0 && films.length > 0)
          main = `${links.join(", ")} — ${films.join(", ")}`;
        else if (links.length > 0) main = links.join(", ");
        else if (films.length > 0) main = films.join(", ");
        else main = esc(e.ru);
        return `<div class="row${e.winner ? " win" : ""}">
          <div class="ico">${e.winner ? "🏆" : "·"}</div>
          <div><div class="main">${main}${e.winner ? `<span class="badge">ПОБЕДА</span>` : ""}</div>${
            e.en ? `<div class="en">${esc(e.en)}</div>` : ""
          }</div>
        </div>`;
      })
      .join("");
    parts.push(
      `<section><h2>${esc(cat.name)}<span class="cnt">${cat.entries.length} номин.</span></h2>${rows}</section>`,
    );
  }

  return page(`${payload.awardName} ${payload.year} — отчёт`, parts.join("\n"));
}

/* ------------------- Kinopoisk film search ------------------- */

export function buildFilmHtml(
  query: string,
  filmYear: number,
  matches: FilmMatch[],
): string {
  const wins = matches.filter((m) => m.entry.winner);
  const groups: {
    key: string;
    awardName: string;
    year: number;
    sourceUrl: string;
    items: FilmMatch[];
  }[] = [];
  for (const m of matches) {
    const key = `${m.awardSlug}:${m.awardYear}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        awardName: m.awardName,
        year: m.awardYear,
        sourceUrl: m.sourceUrl,
        items: [],
      };
      groups.push(g);
    }
    g.items.push(m);
  }
  for (const g of groups)
    g.items.sort((a, b) => Number(b.entry.winner) - Number(a.entry.winner));

  const parts: string[] = [];
  parts.push(
    `<h1>🎞️ <span class="accent">«${esc(query)}»</span> (${filmYear}) — награды и номинации</h1>`,
  );
  parts.push(
    `<div class="sub">Премии Кинопоиска за ${filmYear}–${filmYear + 2} годы</div>`,
  );
  parts.push(
    `<div class="stats">
      <div class="stat"><b>${wins.length}</b><span>побед</span></div>
      <div class="stat"><b>${matches.length}</b><span>номинаций</span></div>
      <div class="stat"><b>${groups.length}</b><span>премий</span></div>
    </div>`,
  );

  if (wins.length > 0) {
    const rows = wins
      .map(
        (m) =>
          `<tr class="win"><td><a href="${esc(m.sourceUrl)}">${esc(m.awardName)}</a></td><td>${m.awardYear}</td><td>${esc(m.category)}</td><td>${esc(
            m.entry.people.map((p) => p.text).join(", ") || query,
          )}</td></tr>`,
      )
      .join("");
    parts.push(
      `<section><h2>🏆 Победы (${wins.length})</h2><table><tr><th>Премия</th><th>Год</th><th>Категория</th><th>Лауреат</th></tr>${rows}</table></section>`,
    );
  }

  for (const g of groups) {
    const gWins = g.items.filter((m) => m.entry.winner).length;
    const rows = g.items
      .map(
        (m) => `<div class="row${m.entry.winner ? " win" : ""}">
        <div class="ico">${m.entry.winner ? "🏆" : "·"}</div>
        <div><div class="main">${esc(m.category)}${
          m.entry.winner ? `<span class="badge">ПОБЕДА</span>` : ""
        }</div><div class="en">${esc(m.entry.ru)}${m.entry.en ? ` · ${esc(m.entry.en)}` : ""}</div></div>
      </div>`,
      )
      .join("");
    parts.push(
      `<section><h2><a href="${esc(g.sourceUrl)}">${esc(g.awardName)} ${g.year}</a>${
        gWins > 0 ? `<span class="badge">🏆 ${gWins}</span>` : ""
      }<span class="cnt">${g.items.length} номин.</span></h2>${rows}</section>`,
    );
  }

  if (matches.length === 0) {
    parts.push(`<section><div class="row"><div>Ничего не найдено.</div></div></section>`);
  }

  return page(`«${query}» (${filmYear}) — награды`, parts.join("\n"));
}

/* ------------------- IMDb awards ------------------- */

export function buildImdbHtml(payload: ImdbAwardsPayload): string {
  const { title, stats, nominations } = payload;
  const groups = groupImdbNominations(nominations);
  const wins = nominations.filter((n) => n.isWinner);
  const parts: string[] = [];

  if (title.imageUrl) {
    parts.push(
      `<img class="poster" src="${esc(title.imageUrl)}" alt="" referrerpolicy="no-referrer">`,
    );
  }
  parts.push(
    `<h1><span class="accent">${esc(title.title)}</span>${title.year ? ` (${title.year})` : ""} — награды IMDb</h1>`,
  );
  const meta: string[] = [];
  if (title.rating) meta.push(`★ ${title.rating}`);
  if (title.genres?.length) meta.push(title.genres.join(", "));
  parts.push(
    `<div class="sub">Источник: <a href="https://www.imdb.com/title/${esc(title.id)}/awards/">imdb.com/title/${esc(title.id)}/awards</a>${
      meta.length ? ` · ${esc(meta.join(" · "))}` : ""
    }</div>`,
  );
  parts.push(
    `<div class="stats">
      <div class="stat"><b>${stats.winCount}</b><span>побед</span></div>
      <div class="stat"><b>${stats.nominationCount}</b><span>номинаций</span></div>
      <div class="stat"><b>${groups.length}</b><span>событий</span></div>
    </div>`,
  );
  if (title.plot) {
    parts.push(
      `<section><div class="row"><div class="main" style="color:#94a3b8;font-size:13.5px">${esc(title.plot)}</div></div></section>`,
    );
  }

  if (wins.length > 0) {
    const rows = wins
      .map((n) => {
        const url = n.eventId
          ? `https://www.imdb.com/event/${n.eventId}/${n.year ?? ""}`
          : "";
        return `<tr class="win"><td>${
          url ? `<a href="${esc(url)}">${esc(n.eventName)}</a>` : esc(n.eventName)
        }</td><td>${n.year ?? ""}</td><td>${esc(n.awardText ?? "")}</td><td>${esc(
          n.category ?? "",
        )}</td><td>${esc(n.nominees.map((p) => p.name).join(", "))}</td></tr>`;
      })
      .join("");
    parts.push(
      `<section><h2>🏆 Победы (${wins.length})</h2><table><tr><th>Событие</th><th>Год</th><th>Награда</th><th>Категория</th><th>Лауреаты</th></tr>${rows}</table></section>`,
    );
  }

  for (const g of groups) {
    const gWins = g.items.filter((n) => n.isWinner).length;
    const url = g.eventId
      ? `https://www.imdb.com/event/${g.eventId}/${g.year ?? ""}`
      : "";
    const rows = g.items
      .map((n) => {
        const chips = n.nominees
          .map((p) => {
            const inner = `${
              p.imageUrl
                ? `<img src="${esc(p.imageUrl)}" alt="" referrerpolicy="no-referrer">`
                : `<span style="width:20px;text-align:center">👤</span>`
            }${esc(p.name)}`;
            return p.id
              ? `<a class="chip" href="https://www.imdb.com/name/${esc(p.id)}/">${inner}</a>`
              : `<span class="chip">${inner}</span>`;
          })
          .join("");
        return `<div class="row${n.isWinner ? " win" : ""}">
          <div class="ico">${n.isWinner ? "🏆" : "·"}</div>
          <div><div class="main">${esc(
            [n.awardText, n.category].filter(Boolean).join(" · "),
          )}${n.isWinner ? `<span class="badge">ПОБЕДА</span>` : ""}</div>${
            chips ? `<div class="chips">${chips}</div>` : ""
          }${n.notes ? `<div class="en">${esc(n.notes)}</div>` : ""}</div>
        </div>`;
      })
      .join("");
    parts.push(
      `<section><h2>${
        url
          ? `<a href="${esc(url)}">${esc(g.eventName)} ${g.year ?? ""}</a>`
          : `${esc(g.eventName)} ${g.year ?? ""}`
      }${gWins > 0 ? `<span class="badge">🏆 ${gWins}</span>` : ""}<span class="cnt">${g.items.length} номин.</span></h2>${rows}</section>`,
    );
  }

  return page(
    `${title.title}${title.year ? ` (${title.year})` : ""} — награды IMDb`,
    parts.join("\n"),
  );
}
