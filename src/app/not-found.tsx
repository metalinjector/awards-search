import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 text-white">
      <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="text-4xl">🔍</div>
        <h1 className="mt-4 text-xl font-semibold">Страница не найдена</h1>
        <p className="mt-2 text-sm text-slate-400">
          Такой страницы нет. Вернитесь на главную и постройте отчёт заново.
        </p>
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
