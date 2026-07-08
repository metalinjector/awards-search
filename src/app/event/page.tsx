import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import EventView from "@/components/EventView";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ name?: string; year?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { name, year } = await searchParams;
  return {
    title: name ? `${name} ${year ?? ""} — все номинанты` : "Церемония — все номинанты",
  };
}

export default async function EventPage({ searchParams }: Props) {
  const { name, year } = await searchParams;
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/imdb" className="text-sm text-slate-400 hover:text-purple-300">
          ← К поиску IMDb
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-3 text-3xl font-bold">
          <span>🎪</span>
          <span>
            {name ? (
              <>
                <span className="bg-gradient-to-r from-purple-300 to-fuchsia-400 bg-clip-text text-transparent">
                  {name}
                </span>{" "}
                {year}
              </>
            ) : (
              "Церемония — все номинанты"
            )}
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Полный список всех фильмов и персон, номинированных в каждой категории этой
          церемонии. Значки 🏆/⭐ ведут к наградам фильма или персоны.
        </p>
        <div className="mt-6">
          <Suspense fallback={null}>
            <EventView />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
