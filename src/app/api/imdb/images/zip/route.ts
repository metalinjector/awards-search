import { NextRequest, NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import {
  fetchOfficialTitle,
  fetchTitleImages,
  type GalleryImage,
  type GalleryPage,
} from "@/lib/imdb";
import { enforceRateLimit } from "@/lib/api-security";
import { acquireLease } from "@/lib/work-queue";
import { incrementMetric } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_IMAGES = 500;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_INPUT_BYTES = 1024 * 1024 * 1024;
/** Gallery pages fetched for one archive (each page holds ~50 images) */
const MAX_PAGES = 20;
/** Images fetched ahead of the one being written */
const WINDOW = 4;

/** Strip characters that are invalid in file names */
function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

/** RFC 5987 encoding for Content-Disposition filename* */
function rfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

async function fetchImage(url: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname !== "media-amazon.com" &&
      !parsed.hostname.endsWith(".media-amazon.com")
    ) {
      return null;
    }
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    const advertised = Number(res.headers.get("content-length") ?? "0");
    if (advertised > MAX_IMAGE_BYTES) return null;
    if (!res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const image = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      image.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return image.buffer;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Validate before spending the caller's rate-limit budget
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }
  const limited = enforceRateLimit(req, { name: "imdb_zip", limit: 2, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const releaseLease = acquireLease("imdb_zip", 2);
  if (!releaseLease) {
    return NextResponse.json(
      { error: "Уже формируются два архива. Попробуйте немного позже." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }

  // Only the title and the first page are needed before the download starts;
  // the rest of the image list is paged in while the archive is streaming.
  let first: GalleryPage;
  let title: string;
  try {
    [first, title] = await Promise.all([fetchTitleImages(id), fetchOfficialTitle(id)]);
  } catch (err) {
    releaseLease();
    const message =
      err instanceof Error ? err.message : "Не удалось получить галерею";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (first.images.length === 0) {
    releaseLease();
    return NextResponse.json(
      { error: "В галерее нет изображений" },
      { status: 404 },
    );
  }

  const zipName = `${safeFileName(title) || id} img.zip`;
  const expected = Math.min(MAX_IMAGES, Math.max(first.totalCount, first.images.length));
  const pad = String(expected).length;

  const abort = new AbortController();
  req.signal?.addEventListener("abort", () => abort.abort(), { once: true });

  /** The image list, page by page, capped at MAX_IMAGES */
  async function* allImages(): AsyncGenerator<GalleryImage> {
    let page = first;
    let yielded = 0;
    for (let n = 1; ; n++) {
      for (const image of page.images) {
        if (yielded >= MAX_IMAGES) return;
        yielded += 1;
        yield image;
      }
      if (!page.nextPageToken || n >= MAX_PAGES || abort.signal.aborted) return;
      try {
        page = await fetchTitleImages(id, page.nextPageToken);
      } catch {
        // the archive is already on its way — finish it with what we have
        incrementMetric("imdb_zip_list_cut_total");
        return;
      }
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          abort.abort();
          try {
            controller.error(err);
          } catch {}
          return;
        }
        try {
          controller.enqueue(chunk);
          if (final) controller.close();
        } catch {
          abort.abort();
        }
      });

      try {
        // Sliding window: prefetch a few images ahead, append strictly in order
        const source = allImages();
        const queue: { image: GalleryImage; data: Promise<ArrayBuffer | null> }[] = [];
        const fill = async () => {
          while (queue.length < WINDOW) {
            const next = await source.next();
            if (next.done) return;
            queue.push({ image: next.value, data: fetchImage(next.value.url, abort.signal) });
          }
        };
        let index = 0;
        let totalInputBytes = 0;
        for (await fill(); queue.length > 0; await fill()) {
          const { image, data } = queue.shift()!;
          index += 1;
          const buf = await data;
          if (abort.signal.aborted) return;
          if (!buf) continue; // skip broken images
          totalInputBytes += buf.byteLength;
          if (totalInputBytes > MAX_ARCHIVE_INPUT_BYTES) {
            incrementMetric("imdb_zip_size_limit_total");
            break; // close the archive with what fits
          }

          // Respect backpressure: don't run far ahead of the client.
          // (After a cancel desiredSize stays 0 forever — hence the abort check.)
          while (!abort.signal.aborted && (controller.desiredSize ?? 1) <= 0) {
            await sleep(50);
          }
          if (abort.signal.aborted) return;

          const ext =
            image.url.match(/\.(jpe?g|png|gif|webp)(?:$|\?)/i)?.[1]?.toLowerCase() ??
            "jpg";
          const type = image.type ? safeFileName(image.type).replace(/\s+/g, "_") : "";
          const name =
            String(index).padStart(pad, "0") + (type ? `_${type}` : "") + `.${ext}`;
          // JPEGs don't compress — store as-is (fast, streams instantly)
          const file = new ZipPassThrough(name);
          zip.add(file);
          file.push(new Uint8Array(buf), true);
        }
        zip.end();
      } catch (err) {
        if (!abort.signal.aborted) {
          abort.abort();
          try {
            controller.error(err);
          } catch {}
        }
      } finally {
        // Free the slot however the archive ended: completed, failed or cancelled
        abort.abort();
        releaseLease();
      }
    },
    cancel() {
      incrementMetric("imdb_zip_cancelled_total");
      abort.abort();
      releaseLease();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${rfc5987(zipName)}`,
      "Cache-Control": "no-store",
    },
  });
}
