import { NextRequest } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import { contentDisposition, IMDB_TITLE_ID, jsonError, MIME, safeFileName } from "@/lib/api";
import { BROWSER_UA, fetchBytes, sleep } from "@/lib/http";
import {
  fetchOfficialTitle,
  fetchTitleImages,
  type GalleryImage,
  type GalleryPage,
} from "@/lib/imdb";
import { errorText, log } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Each archive proxies hundreds of megabytes — keep the number of parallel ones small */
const MAX_ACTIVE = 2;
let active = 0;

/** Images fetched ahead of the one being written */
const WINDOW = 4;
const MAX_PAGES = 60;
const IMAGE_TIMEOUT_MS = 60_000;

async function fetchImage(url: string, signal: AbortSignal): Promise<ArrayBuffer | null> {
  try {
    return await fetchBytes(url, {
      headers: { "User-Agent": BROWSER_UA },
      timeoutMs: IMAGE_TIMEOUT_MS,
      signal,
    });
  } catch {
    return null; // broken image — skipped
  }
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!IMDB_TITLE_ID.test(id)) return jsonError("Некорректный IMDb ID", 400);
  const limited = rateLimited(req, "zip");
  if (limited) return limited;
  if (active >= MAX_ACTIVE) {
    return Response.json(
      { error: "Сейчас скачивается слишком много архивов — повторите через минуту." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

  // Only the title and the first page are needed before the download can start;
  // the rest of the image list is paged in while the archive is streaming.
  let first: GalleryPage;
  let title: string;
  try {
    [first, title] = await Promise.all([fetchTitleImages(id), fetchOfficialTitle(id)]);
  } catch (err) {
    return jsonError(errorText(err) || "Не удалось получить галерею", 502);
  }
  if (first.images.length === 0) {
    return jsonError("В галерее нет изображений", 404);
  }

  const zipName = `${safeFileName(title, id, 120)} img.zip`;
  const pad = String(Math.max(first.totalCount, first.images.length)).length;
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  /** The full image list, page by page */
  async function* allImages(): AsyncGenerator<GalleryImage> {
    let page = first;
    for (let n = 1; ; n++) {
      yield* page.images;
      if (!page.nextPageToken || n >= MAX_PAGES || abort.signal.aborted) return;
      try {
        page = await fetchTitleImages(id, page.nextPageToken);
      } catch (err) {
        // the archive is already on its way — finish it with what we have
        log.warn("zip", "image list cut short", { id, page: n, error: errorText(err) });
        return;
      }
    }
  }

  active += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      active -= 1;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (abort.signal.aborted) return;
        if (err) {
          abort.abort();
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });

      try {
        // Sliding window: prefetch a few images ahead, append strictly in order
        const source = allImages();
        const queue: { image: GalleryImage; data: Promise<ArrayBuffer | null> }[] = [];
        const fill = async () => {
          while (queue.length < WINDOW) {
            const next = await source.next();
            if (next.done) return;
            queue.push({
              image: next.value,
              data: fetchImage(next.value.url, abort.signal),
            });
          }
        };

        let index = 0;
        for (await fill(); queue.length > 0; await fill()) {
          const { image, data } = queue.shift()!;
          index += 1;
          const buf = await data;

          // Respect backpressure: don't run far ahead of the client.
          // (After a cancel desiredSize stays 0 forever — hence the abort check.)
          while (!abort.signal.aborted && (controller.desiredSize ?? 1) <= 0) {
            await sleep(50);
          }
          if (abort.signal.aborted) return;
          if (!buf) continue;

          const ext =
            image.url.match(/\.(jpe?g|png|gif|webp)(?:$|\?)/i)?.[1]?.toLowerCase() ??
            "jpg";
          const name =
            String(index).padStart(pad, "0") +
            (image.type ? `_${safeFileName(image.type, "image")}` : "") +
            `.${ext}`;
          // JPEGs don't compress — store as-is (fast, streams instantly)
          const file = new ZipPassThrough(name);
          zip.add(file);
          file.push(new Uint8Array(buf), true);
        }
        zip.end();
      } catch (err) {
        if (!abort.signal.aborted) {
          log.error("zip", "archive failed", { id, error: errorText(err) });
          abort.abort();
          controller.error(err);
        }
      } finally {
        release();
      }
    },
    cancel() {
      // client aborted the download: stop the loop and the in-flight image fetches
      abort.abort();
      release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": MIME.zip,
      "Content-Disposition": contentDisposition(zipName),
      "Cache-Control": "no-store",
    },
  });
}
