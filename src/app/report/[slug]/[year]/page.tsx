import Link from "next/link";
import type { Metadata } from "next";
import ReportView from "@/components/ReportView";
import { getOrCreateReport } from "@/lib/report-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Props {
  params: Promise<{ slug: string; year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year } = await params;
  return { title: `Отчёт: ${slug} ${year} — Кинонаграды` };
}

export default async function ReportPage({ params }: Props) {
  const { slug, year: yearStr } = await params;
  const year = parseInt(yearStr, 10);

  if (!/^[a-z0-9_\-]+$/i.test(slug) || !Number.isFinite(year)) {
    return <ErrorScreen message="Некорректный адрес отчёта." />;
  }

  let data: Awaited<ReturnType<typeof getOrCreateReport>> | null = null;
  let errorMessage = "Не удалось построить отчёт.";
  try {
    data = await getOrCreateReport(slug.toLowerCase(), year);
  } catch (err) {
    if (err instanceof Error) errorMessage = err.message;
  }

  if (!data) {
    return <ErrorScreen message={errorMessage} />;
  }
  return (
    <ReportView
      payload={data.payload}
      slug={slug.toLowerCase()}
      fetchedAt={data.fetchedAt.toISOString()}
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
