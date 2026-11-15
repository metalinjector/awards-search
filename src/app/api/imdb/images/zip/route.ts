import { NextRequest, NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import {
  fetchOfficialTitle,
  fetchTitleImages,
  type GalleryImage,
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
  const limited = enforceRateLimit(req, { name: "imdb_zip", limit: 2, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const releaseLease = acquireLease("imdb_zip", 2);
  if (!releaseLease) {
    return NextResponse.json(
      { error: "Уже формируются два архива. Попробуйте немного позже." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^tt\d{4,12}$/.test(id)) {
    releaseLease();
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }

  // Collect the full image list (metadata only) + the official title
  let images: GalleryImage[];
  let title: string;
  try {
    images = [];
    let token: string | undefined;
    for (let page = 0; page < 10 && images.length < MAX_IMAGES; page++) {
      const p = await fetchTitleImages(id, token);
      images.push(...p.images.slice(0, MAX_IMAGES - images.length));
      token = p.nextPageToken;
      if (!token) break;
    }
    title = safeFileName(await fetchOfficialTitle(id));
  } catch (err) {
    releaseLease();
    const message =
      err instanceof Error ? err.message : "Не удалось получить галерею";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (images.length === 0) {
    releaseLease();
    return NextResponse.json(
      { error: "В галерее нет изображений" },
      { status: 404 },
    );
  }

  const zipName = `${title} img.zip`;
  const pad = String(images.length).length;

  let streamAbortController: AbortController | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const requestController = new AbortController();
      streamAbortController = requestController;
      let released = false;
      const finish = () => {
        if (released) return;
        released = true;
        releaseLease();
      };
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          try {
            controller.error(err);
          } catch {}
          finish();
          return;
        }
        try {
          controller.enqueue(chunk);
          if (final) controller.close();
        } catch {
          requestController.abort();
          finish();
        }
      });

      try {
        // Sliding window: prefetch a few images ahead, append strictly in order
        const WINDOW = 4;
        const pending: (Promise<ArrayBuffer | null> | undefined)[] = [];
        for (let i = 0; i < Math.min(WINDOW, images.length); i++) {
          pending[i] = fetchImage(images[i].url, requestController.signal);
        }
        let totalInputBytes = 0;
        for (let i = 0; i < images.length; i++) {
          const ahead = i + WINDOW;
          if (ahead < images.length) {
            pending[ahead] = fetchImage(images[ahead].url, requestController.signal);
          }

          const buf = await pending[i];
          pending[i] = undefined; // release memory
          if (!buf) continue; // skip broken images
          totalInputBytes += buf.byteLength;
          if (totalInputBytes > MAX_ARCHIVE_INPUT_BYTES) {
            incrementMetric("imdb_zip_size_limit_total");
            requestController.abort();
            break;
          }

          // Respect backpressure: don't run far ahead of the client
          while ((controller.desiredSize ?? 1) <= 0) {
            if (requestController.signal.aborted) {
              throw new DOMException("ZIP stream cancelled", "AbortError");
            }
            await sleep(50);
          }

          const ext =
            images[i].url.match(/\.(jpe?g|png|gif|webp)(?:$|\?)/i)?.[1]?.toLowerCase() ??
            "jpg";
          const name =
            `${String(i + 1).padStart(pad, "0")}` +
            (images[i].type ? `_${images[i].type}` : "") +
            `.${ext}`;
          // JPEGs don't compress — store as-is (fast, streams instantly)
          const file = new ZipPassThrough(name);
          zip.add(file);
          file.push(new Uint8Array(buf), true);
        }
        zip.end();
      } catch (err) {
        try {
          controller.error(err);
        } catch {}
        requestController.abort();
        finish();
      }
    },
    cancel() {
      incrementMetric("imdb_zip_cancelled_total");
      streamAbortController?.abort();
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
