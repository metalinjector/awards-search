import Link from "next/link";
import type { Metadata } from "next";
import TmdbSearch from "@/components/TmdbSearch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Поиск наград через TMDB",
  description: "Поиск фильма по русскому названию через TMDB с переходом к наградам IMDb.",
  alternates: { canonical: "/tmdb" },
};

export default function TmdbPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/" className="text-sm text-slate-400 hover:text-teal-300">
          ← На главную
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/tmdb.svg" alt="TMDB" className="h-6 w-auto" />
          <span>— поиск фильма и его наград</span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Поиск через The Movie Database — можно вводить русские названия. TMDB не хранит
          награды, поэтому после выбора фильма сервис определяет его IMDb ID через TMDB и
          открывает полный отчёт о наградах из модуля IMDb (со всеми экспортами).
        </p>
        <div className="mt-6">
          <TmdbSearch />
        </div>
        <p className="mt-10 text-center text-xs text-slate-600">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </main>
  );
}
