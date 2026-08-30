"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryImage } from "@/lib/imdb";

type Mode = "closed" | "poster" | "grid" | "viewer";

interface Props {
  imdbId: string;
  posterUrl: string;
}

/** Downscaled Amazon media URL for grid thumbnails */
function thumb(u: string): string {
  return u.replace(/\._V1_(\.[a-z]+)$/i, "._V1_UX400_$1");
}

const TYPE_LABEL: Record<string, string> = {
  poster: "постер",
  still_frame: "кадр",
  event: "событие",
  behind_the_scenes: "за кадром",
  publicity: "промо",
  product: "продукт",
};

export default function ImdbGallery({ imdbId, posterUrl }: Props) {
  const [mode, setMode] = useState<Mode>("closed");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const [page, setPage] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(0);
  const fetchingRef = useRef(false);
  const stateRef = useRef({ images, nextToken, totalCount });

  useEffect(() => {
    stateRef.current = { images, nextToken, totalCount };
  }, [images, nextToken, totalCount]);

  /** Load pages until we have at least `until+1` images (or run out) */
  const ensureLoaded = useCallback(
    async (until: number) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);
      setGalleryError(null);
      try {
        let { images: imgs, nextToken: token, totalCount: total } = stateRef.current;
        while (
          imgs.length <= until &&
          (token !== undefined || total === null)
        ) {
          const qs =
            `/api/imdb/images?id=${imdbId}` +
            (token ? `&pageToken=${encodeURIComponent(token)}` : "");
          const res = await fetch(qs);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки галереи");
          imgs = [...imgs, ...data.images];
          token = data.nextPageToken;
          total = data.totalCount ?? imgs.length;
          setImages(imgs);
          setNextToken(token);
          setTotalCount(total);
          if (!token) break;
        }
      } catch (e) {
        setGalleryError(e instanceof Error ? e.message : "Ошибка загрузки галереи");
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [imdbId],
  );

  const pageSize = cols * rows;
  const total = totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // keep the visible grid page loaded
  useEffect(() => {
    if (mode !== "grid") return;
    ensureLoaded((page + 1) * pageSize - 1);
  }, [mode, page, pageSize, ensureLoaded]);

  const openGallery = () => {
    setMode("grid");
    if (images.length === 0) ensureLoaded(pageSize - 1);
  };

  const showViewer = async (i: number) => {
    if (totalCount !== null && i >= totalCount) return;
    setViewerIndex(i);
    setMode("viewer");
    await ensureLoaded(i);
  };

  const viewerPrev = useCallback(() => {
    setViewerIndex((i) => Math.max(0, i - 1));
  }, []);
  const viewerNext = useCallback(async () => {
    const { totalCount: total } = stateRef.current;
    const ni = viewerIndex + 1;
    if (total !== null && ni >= total) return;
    await ensureLoaded(ni);
    if (stateRef.current.images.length > ni) setViewerIndex(ni);
  }, [viewerIndex, ensureLoaded]);

  // keyboard: Esc closes / steps back, arrows navigate the viewer
  useEffect(() => {
    if (mode === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(mode === "viewer" ? "grid" : "closed");
      } else if (mode === "viewer") {
        if (e.key === "ArrowLeft") viewerPrev();
        if (e.key === "ArrowRight") viewerNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, viewerPrev, viewerNext]);

  // lock body scroll while any overlay is open
  useEffect(() => {
    if (mode === "closed") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mode]);

  const gridStep = (v: number, d: number) => Math.min(6, Math.max(2, v + d));
  const current = images[viewerIndex];

  return (
    <>
      {/* clickable poster in the title card */}
      <button
        type="button"
        onClick={() => setMode("poster")}
        title="Увеличить постер"
        className="group relative shrink-0 cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={posterUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-40 w-28 rounded-lg object-cover shadow-lg transition group-hover:brightness-110"
        />
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 text-2xl opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
          🔍
        </span>
      </button>

      {/* ---------- enlarged poster ---------- */}
      {mode === "poster" && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setMode("closed")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterUrl}
            alt=""
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              openGallery();
            }}
            className="mt-3 text-xs text-slate-400 underline decoration-dotted underline-offset-4 transition hover:text-yellow-300"
          >
            смотреть всю галерею
          </button>
          <button
            onClick={() => setMode("closed")}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/25"
            title="Закрыть (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---------- gallery grid ---------- */}
      {mode === "grid" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setMode("closed")}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl"
          >
            {/* header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">
                Галерея{" "}
                {totalCount !== null && (
                  <span className="font-normal text-slate-400">
                    — {totalCount} изображений
                  </span>
                )}
              </h3>

              {/* grid size control */}
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300">
                <span className="mr-1 text-slate-500">сетка</span>
                <button
                  onClick={() => {
                    setCols((v) => gridStep(v, -1));
                    setPage(0);
                  }}
                  className="h-5 w-5 rounded bg-white/10 hover:bg-white/25"
                >
                  −
                </button>
                <span className="w-3 text-center font-semibold text-white">{cols}</span>
                <button
                  onClick={() => {
                    setCols((v) => gridStep(v, 1));
                    setPage(0);
                  }}
                  className="h-5 w-5 rounded bg-white/10 hover:bg-white/25"
                >
                  +
                </button>
                <span className="px-0.5 text-slate-500">×</span>
                <button
                  onClick={() => {
                    setRows((v) => gridStep(v, -1));
                    setPage(0);
                  }}
                  className="h-5 w-5 rounded bg-white/10 hover:bg-white/25"
                >
                  −
                </button>
                <span className="w-3 text-center font-semibold text-white">{rows}</span>
                <button
                  onClick={() => {
                    setRows((v) => gridStep(v, 1));
                    setPage(0);
                  }}
                  className="h-5 w-5 rounded bg-white/10 hover:bg-white/25"
                >
                  +
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <a
                  href={`/api/imdb/images/zip?id=${imdbId}`}
                  title="Скачать все изображения одним ZIP-архивом (для больших галерей — несколько минут)"
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
                >
                  ⬇ Скачать всю галерею
                </a>
                <button
                  onClick={() => setMode("closed")}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
                  title="Закрыть (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* thumbnails */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {galleryError && (
                <div className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {galleryError}
                </div>
              )}
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {images
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map((img, i) => {
                    const idx = page * pageSize + i;
                    return (
                      <button
                        key={idx}
                        onClick={() => showViewer(idx)}
                        title={TYPE_LABEL[img.type ?? ""] ?? img.type}
                        className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-white/10 bg-white/5 transition hover:border-yellow-400/60"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumb(img.url)}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        {img.type && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {TYPE_LABEL[img.type] ?? img.type}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-yellow-300 border-t-transparent" />
                  Загружаем…
                </div>
              )}
            </div>

            {/* pagination */}
            <div className="flex items-center justify-center gap-4 border-t border-white/10 px-4 py-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 disabled:opacity-30"
              >
                ‹
              </button>
              <span className="text-sm text-slate-400">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page + 1 >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- single image viewer ---------- */}
      {mode === "viewer" && current && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setMode("grid")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt=""
            referrerPolicy="no-referrer"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          />
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
            <span>
              {viewerIndex + 1} / {totalCount ?? images.length}
              {current.type && (
                <span className="ml-2 text-slate-500">
                  · {TYPE_LABEL[current.type] ?? current.type}
                </span>
              )}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMode("grid");
              }}
              className="text-xs text-slate-400 underline decoration-dotted underline-offset-4 hover:text-yellow-300"
            >
              ← к галерее
            </button>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              viewerPrev();
            }}
            disabled={viewerIndex === 0}
            className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/25 disabled:opacity-20"
            title="Предыдущее (←)"
          >
            ‹
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              viewerNext();
            }}
            disabled={totalCount !== null && viewerIndex + 1 >= totalCount}
            className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white transition hover:bg-white/25 disabled:opacity-20"
            title="Следующее (→)"
          >
            ›
          </button>
          <button
            onClick={() => setMode("closed")}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white transition hover:bg-white/25"
            title="Закрыть (Esc)"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
