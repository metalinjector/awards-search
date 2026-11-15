import Link from "next/link";
import UrlForm from "@/components/UrlForm";
import FilmSearchForm from "@/components/FilmSearchForm";
import { listRecentReports } from "@/lib/report-service";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  let recent: Awaited<ReturnType<typeof listRecentReports>> = [];
  try {
    recent = await listRecentReports();
  } catch {
    recent = [];
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
        <div className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-300">
            🏆 Кинопремии в удобном виде
          </div>
          <h1 className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-4xl font-bold tracking-tight sm:text-5xl">
            <span>Отчёты о кинонаградах</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/kinopoisk.svg"
              alt="Кинопоиск"
              className="inline-block h-8 w-auto sm:h-10"
            />
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            Вставьте ссылку на любую страницу премии с{" "}
            <a
              href="https://www.kinopoisk.ru/awards/"
              target="_blank"
              rel="noreferrer"
              className="text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:decoration-amber-300"
            >
              kinopoisk.ru/awards
            </a>{" "}
            — и получите наглядный отчёт: кто победил, кто номинировался, с сортировкой,
            поиском и выгрузкой в XLSX и Markdown.
          </p>
        </div>

        {/* Kinopoisk tools — concave panel */}
        <div className="relative mt-10 rounded-[28px] bg-gradient-to-b from-white/[0.14] via-white/[0.04] to-amber-400/[0.14] p-px shadow-[0_1px_0_rgba(255,255,255,0.06)]">
          <div className="rounded-[27px] bg-gradient-to-b from-[#0a101f] via-[#0d1424] to-[#0a101f] p-6 shadow-[inset_0_10px_28px_rgba(0,0,0,0.65),inset_0_-6px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(0,0,0,0.8),inset_0_-1px_0_rgba(251,191,36,0.08)] sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/kinopoisk.svg"
                alt="Кинопоиск"
                className="h-4 w-auto drop-shadow-[0_0_12px_rgba(255,85,0,0.35)]"
              />
              <span className="h-px flex-1 bg-gradient-to-r from-amber-500/40 via-white/10 to-transparent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                премии и фильмы
              </span>
            </div>

            <UrlForm />

            <div className="my-7 flex items-center gap-4">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <span className="text-xs uppercase tracking-widest text-slate-600">или</span>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            <h2 className="text-lg font-semibold text-white">
              🎞️ Найти все награды фильма
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Введите название фильма и год его выпуска — сервис проверит все 24 премии
              Кинопоиска за год фильма и до двух следующих, не включая будущие годы, и
              отдельно выделит победы.
            </p>
            <div className="mt-4">
              <FilmSearchForm />
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-yellow-400/20 bg-gradient-to-r from-yellow-500/10 via-transparent to-teal-500/10 p-6 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-2xl">
              <h2 className="flex flex-wrap items-center gap-2.5 text-lg font-semibold text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logos/imdb.svg" alt="IMDb" className="h-6 w-auto" />
                Найти фильм и все его награды
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                IMDb хранит мировую историю наград, а TMDB помогает найти нужный фильм по
                русскому названию. Оба пути ведут к одному полному отчёту и экспортам.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/imdb"
                className="rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-yellow-500/20 transition hover:brightness-110"
              >
                IMDb: все награды →
              </Link>
              <Link
                href="/tmdb"
                className="rounded-xl bg-gradient-to-r from-teal-400 to-sky-500 px-5 py-3 font-semibold text-slate-950 shadow-lg shadow-teal-500/20 transition hover:brightness-110"
              >
                Поиск на русском
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: "🥇",
              title: "Победители и номинанты",
              text: "Все категории на одной странице: победители выделены, номинанты рядом.",
            },
            {
              icon: "↕️",
              title: "Сортировка и поиск",
              text: "Табличный вид с сортировкой по любой колонке и мгновенным поиском.",
            },
            {
              icon: "📥",
              title: "XLSX и Markdown",
              text: "Выгрузка в Excel с автошириной колонок и переносом строк, а также в MD.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="text-2xl">{f.icon}</div>
              <div className="mt-2 font-semibold text-white">{f.title}</div>
              <div className="mt-1 text-sm text-slate-400">{f.text}</div>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-500">
              Недавние отчёты
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((r) => (
                <Link
                  key={`${r.awardSlug}-${r.year}`}
                  href={`/report/${r.awardSlug}/${r.year}`}
                  className="group rounded-xl border border-white/10 bg-white/5 px-5 py-4 transition hover:border-amber-400/40 hover:bg-white/10"
                >
                  <div className="font-semibold text-white group-hover:text-amber-300">
                    {r.awardName} {r.year}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    обновлено{" "}
                    {new Date(r.fetchedAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
