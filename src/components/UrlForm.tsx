"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  { label: "Оскар 2026", url: "https://www.kinopoisk.ru/awards/oscar/2026/" },
  { label: "Оскар 2020", url: "https://www.kinopoisk.ru/awards/oscar/2020/" },
  { label: "Сезар 2025", url: "https://www.kinopoisk.ru/awards/cesar/2025/" },
  { label: "Золотой глобус 2025", url: "https://www.kinopoisk.ru/awards/golden_globes/2025/" },
  { label: "BAFTA 2025", url: "https://www.kinopoisk.ru/awards/bafta/2025/" },
  { label: "Канны 2025", url: "https://www.kinopoisk.ru/awards/cannes/2025/" },
  { label: "Эмми 2025", url: "https://www.kinopoisk.ru/awards/emmy/2025/" },
  { label: "Ника 2025", url: "https://www.kinopoisk.ru/awards/nika/2025/" },
];

export default function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(target?: string) {
    const value = (target ?? url).trim();
    if (!value || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не удалось построить отчёт");
        setLoading(false);
        return;
      }
      router.push(`/report/${data.slug}/${data.year}`);
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.kinopoisk.ru/awards/oscar/2026/"
          className="flex-1 rounded-xl border border-amber-200/20 bg-white/10 px-5 py-4 text-base text-white placeholder-slate-400 outline-none backdrop-blur transition focus:border-amber-400/60 focus:bg-white/15"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-8 py-4 font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Загружаем…" : "Построить отчёт"}
        </button>
      </form>

      {loading && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200/20 bg-amber-500/10 px-5 py-4 text-amber-200">
          <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
          <span>
            Забираем данные со страницы Кинопоиска и готовим отчёт — обычно 10–40 секунд…
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            type="button"
            disabled={loading}
            onClick={() => {
              setUrl(ex.url);
              void submit(ex.url);
            }}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-slate-300 transition hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-50"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
