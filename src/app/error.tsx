"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 text-white">
      <div className="max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 p-8 text-center">
        <div className="text-4xl">🎬</div>
        <h1 className="mt-4 text-xl font-semibold">Что-то пошло не так</h1>
        <p className="mt-2 text-sm text-slate-400">
          Непредвиденная ошибка. Попробуйте ещё раз.
          {error.digest && <span className="mt-1 block text-xs">Код: {error.digest}</span>}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 font-semibold text-slate-950"
          >
            Повторить
          </button>
          <Link
            href="/"
            className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-slate-300 hover:border-amber-400/50"
          >
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
