import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import ReportView from "@/components/ReportView";
import { AWARD_SLUG, parseYear } from "@/lib/api";
import { awardNameBySlug } from "@/lib/awards";
import { errorText } from "@/lib/log";
import { limitFor, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import {
  getCachedReport,
  getOrCreateReport,
  type StoredReport,
} from "@/lib/report-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Props {
  params: Promise<{ slug: string; year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, year } = await params;
  const name = awardNameBySlug.get(slug.toLowerCase()) ?? slug;
  return { title: `${name} ${year} — Кинонаграды` };
}

export default async function ReportPage({ params }: Props) {
  const { slug: rawSlug, year: yearStr } = await params;
  const slug = rawSlug.toLowerCase();
  const year = /^\d{4}$/.test(yearStr) ? parseYear(yearStr) : null;

  if (!AWARD_SLUG.test(slug) || year === null) {
    return <ErrorScreen message="Некорректный адрес отчёта." />;
  }

  let data: StoredReport | null = null;
  let errorMessage = "Не удалось построить отчёт.";
  try {
    // A cached report is served as is. Building a new one means scraping
    // Kinopoisk for up to a few minutes, so that path is rate-limited and
    // skips pages recently found to be absent.
    data = await getCachedReport(slug, year);
    if (!data) {
      if (limitFor(await headers(), "report").ok) {
        data = await getOrCreateReport(slug, year, { useMissCache: true });
      } else {
        errorMessage = RATE_LIMIT_MESSAGE;
      }
    }
  } catch (err) {
    errorMessage = errorText(err) || errorMessage;
  }

  if (!data) {
    return <ErrorScreen message={errorMessage} />;
  }
  return (
    <ReportView
      payload={data.payload}
      slug={slug}
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
