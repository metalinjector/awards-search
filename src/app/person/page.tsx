import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import PersonView from "@/components/PersonView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Персона — фильмография и награды",
};

export default function PersonPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/imdb" className="text-sm text-slate-400 hover:text-yellow-300">
          ← К поиску IMDb
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/imdb.svg" alt="IMDb" className="h-8 w-auto" />
          <span>— персона: фильмы и награды</span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Полная фильмография персоны. Нажмите «Награды фильма» у любой работы, чтобы
          увидеть все её номинации и победы.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <PersonView />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
