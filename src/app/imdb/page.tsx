import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import ImdbSearch from "@/components/ImdbSearch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Поиск наград фильма на IMDb",
  description: "Найдите фильм и получите все победы и номинации по данным IMDb.",
  alternates: { canonical: "/imdb" },
};

export default function ImdbPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/" className="text-sm text-slate-400 hover:text-yellow-300">
          ← На главную
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/imdb.svg" alt="IMDb" className="h-9 w-auto" />
          <span>— все награды фильма</span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Введите название фильма — выберите нужный вариант из найденных — получите
          полную картину: каждое событие, каждая категория, все номинанты (актёры,
          режиссёры, операторы и т.д.), победы выделены.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <ImdbSearch />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
