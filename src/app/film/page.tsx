import Link from "next/link";
import type { Metadata } from "next";
import FilmSearch from "@/components/FilmSearch";
import FilmSearchForm from "@/components/FilmSearchForm";
import { scanYears } from "@/lib/awards";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string; year?: string; kpId?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q, year } = await searchParams;
  return {
    title: q ? `«${q}» ${year ?? ""} — награды и номинации` : "Поиск фильма по наградам",
    robots: q ? { index: false, follow: true } : undefined,
  };
}

export default async function FilmPage({ searchParams }: Props) {
  const { q, year: yearStr, kpId: kpIdParam } = await searchParams;
  const query = (q ?? "").trim();
  const year = /^\d{4}$/.test(yearStr ?? "") ? Number(yearStr) : Number.NaN;
  const kpId = /^\d{1,12}$/.test(kpIdParam ?? "") ? kpIdParam ?? "" : "";
  const valid = query.length >= 2 && year >= 1900 && year <= 2100;
  const years = valid ? scanYears(year) : [];
  const yearsLabel = years.join(", ");

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link href="/" className="text-sm text-slate-400 hover:text-amber-300">
          ← На главную
        </Link>

        <h1 className="mt-3 text-3xl font-bold">
          🎞️ Награды фильма
          {valid && (
            <>
              {" "}
              <span className="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">
                «{query}»
              </span>{" "}
              <span className="text-xl font-normal text-slate-400">({year})</span>
            </>
          )}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-500">
          <span>Сканируются все премии</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/kinopoisk.svg"
            alt="Кинопоиск"
            className="inline-block h-3.5 w-auto"
          />
          <span>
            за {valid ? yearsLabel || "доступные" : "доступные"} годы — Оскар, Золотой
            глобус, BAFTA, Канны, Сезар и ещё 19 наград.
          </span>
        </p>

        <div className="mt-6">
          <FilmSearchForm
            defaultQuery={query}
            defaultYear={valid ? year : undefined}
            defaultKpId={kpId}
          />
        </div>

        <div className="mt-8">
          {valid ? (
            <FilmSearch
              key={`${query}:${year}:${kpId}`}
              initialQuery={query}
              initialYear={year}
              kpId={kpId || undefined}
            />
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-slate-400">
              Введите название фильма и год его выпуска, чтобы найти все его награды и
              номинации.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
