"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ImdbPersonPayload } from "@/lib/imdb";
import { imdbTypeLabel } from "@/lib/imdb";

const CATEGORY_LABELS: Record<string, string> = {
  actor: "Актёр",
  actress: "Актриса",
  director: "Режиссёр",
  writer: "Сценарист",
  producer: "Продюсер",
  composer: "Композитор",
  cinematographer: "Оператор",
  editor: "Монтажёр",
  self: "Камео / себя",
  archive_footage: "Архивные кадры",
  soundtrack: "Саундтрек",
  stunts: "Каскадёр",
};

export default function PersonView() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [payload, setPayload] = useState<ImdbPersonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || loadedRef.current === id) return;
    loadedRef.current = id;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`/api/imdb/person?id=${id}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
          setPayload(data);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);

  if (!id) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-12 text-center text-slate-400">
        Не указан ID персоны. Откройте персону со страницы наград фильма.
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const films = (payload?.filmography ?? []).filter(
    (f) =>
      !q ||
      f.title.toLowerCase().includes(q) ||
      (f.characters ?? []).some((c) => c.toLowerCase().includes(q)),
  );

  return (
    <div>
      {loading && (
        <div className="flex items-center gap-3 rounded-2xl border border-yellow-200/20 bg-yellow-500/10 px-5 py-5 text-yellow-200">
          <span className="inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent" />
          Загружаем данные персоны и полную фильмографию…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-red-300">
          {error}
          <button
            onClick={() => {
              loadedRef.current = null;
              setError(null);
              // re-trigger effect by resetting the ref and forcing a state change
              setPayload(null);
              setTimeout(() => {
                loadedRef.current = id;
                setLoading(true);
                fetch(`/api/imdb/person?id=${id}`)
                  .then(async (res) => {
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
                    setPayload(data);
                  })
                  .catch((e) => setError(e instanceof Error ? e.message : "Ошибка"))
                  .finally(() => setLoading(false));
              }, 0);
            }}
            className="ml-3 rounded-lg border border-red-300/40 px-3 py-1 text-sm hover:bg-red-500/20"
          >
            Повторить
          </button>
        </div>
      )}

      {payload && (
        <>
          <div className="flex flex-wrap items-start gap-5 rounded-2xl border border-white/10 bg-white/5 p-5">
            {payload.person.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.person.imageUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-44 w-32 shrink-0 rounded-lg object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-44 w-32 items-center justify-center rounded-lg bg-white/10 text-4xl">
                👤
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-white">{payload.person.name}</h2>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {payload.person.professions?.map((p) => (
                  <span key={p} className="rounded-full bg-white/10 px-2.5 py-1 text-slate-300">
                    {CATEGORY_LABELS[p] ?? p}
                  </span>
                ))}
                {typeof payload.person.birthDate === "string" &&
                  payload.person.birthDate && (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-slate-400">
                      род. {payload.person.birthDate}
                    </span>
                  )}
              </div>
              {payload.person.biography && (
                <p className="mt-3 line-clamp-4 text-sm text-slate-400">
                  {payload.person.biography}
                </p>
              )}
              <a
                href={`https://www.imdb.com/name/${payload.person.id}/`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:border-yellow-400/50 hover:text-yellow-300"
              >
                Открыть на IMDb ↗
              </a>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-white">
                {payload.filmography.length}
              </div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                работ в кино
              </div>
            </div>
          </div>

          <div className="sticky top-0 z-10 -mx-4 mt-5 border-b border-white/10 bg-slate-950/90 px-4 py-3 backdrop-blur">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Фильтр по названию или роли…"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-yellow-400/50"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {films.map((f, i) => (
              <div
                key={`${f.titleId}-${f.category}-${i}`}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                {f.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-20 w-14 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-white/10 text-xl">
                    🎬
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">
                    {f.title}{" "}
                    {f.year && <span className="font-normal text-slate-400">({f.year})</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {[
                      imdbTypeLabel(f.type),
                      CATEGORY_LABELS[f.category ?? ""] ?? f.category,
                      f.characters?.length ? `роль: ${f.characters.join(", ")}` : "",
                      f.rating ? `★ ${f.rating}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <Link
                    href={`/imdb?q=${encodeURIComponent(f.title)}&id=${f.titleId}`}
                    className="mt-2 inline-block rounded-lg bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-500/25"
                  >
                    🏆 Награды фильма →
                  </Link>
                </div>
              </div>
            ))}
            {films.length === 0 && !loading && (
              <div className="col-span-full rounded-2xl border border-white/10 bg-white/5 px-6 py-10 text-center text-slate-500">
                Ничего не найдено
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
