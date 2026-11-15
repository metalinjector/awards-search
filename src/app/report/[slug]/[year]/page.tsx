import Link from "next/link";
import type { Metadata } from "next";
import ReportView from "@/components/ReportView";
import { getOrCreateReport } from "@/lib/report-service";
import { notFound } from "next/navigation";
import { awardNameBySlug } from "@/lib/awards";
import { AwardSourceError } from "@/lib/parser";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Props {
  params: Promise<{ slug: string; year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year } = await params;
  const awardName = awardNameBySlug.get(slug.toLowerCase()) ?? slug;
  return {
    title: `${awardName} ${year}: победители и номинанты`,
    description: `Все категории, победители и номинанты премии ${awardName} ${year} с поиском и экспортом.`,
    alternates: { canonical: `/report/${slug.toLowerCase()}/${year}` },
    openGraph: {
      title: `${awardName} ${year}: победители и номинанты`,
      type: "article",
      url: `/report/${slug.toLowerCase()}/${year}`,
    },
  };
}

export default async function ReportPage({ params }: Props) {
  const { slug, year: yearStr } = await params;
  const year = /^\d{4}$/.test(yearStr) ? Number(yearStr) : Number.NaN;

  if (
    !/^[a-z0-9_\-]+$/i.test(slug) ||
    !Number.isFinite(year) ||
    year < 1900 ||
    year > new Date().getFullYear() ||
    !awardNameBySlug.has(slug.toLowerCase())
  ) {
    notFound();
  }

  let data: Awaited<ReturnType<typeof getOrCreateReport>> | null = null;
  let errorMessage = "Не удалось построить отчёт.";
  try {
    data = await getOrCreateReport(slug.toLowerCase(), year);
  } catch (err) {
    if (err instanceof AwardSourceError && err.code === "not_found") notFound();
    if (err instanceof AwardSourceError) errorMessage = err.message;
    else throw err;
  }

  if (!data) {
    return <ErrorScreen message={errorMessage} />;
  }
  return (
    <ReportView
      payload={data.payload}
      slug={slug.toLowerCase()}
      fetchedAt={data.fetchedAt.toISOString()}
      isStale={data.isStale}
    />
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 text-white">
      <div className="max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center">
        <div className="text-4xl">🎬</div>
        <h1 className="mt-4 text-xl font-semibold">Отчёт не получился</h1>
        <p className="mt-2 text-slate-300">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-semibold text-slate-950"
        >
          ← На главную
        </Link>
      </div>
    </main>
  );
}
