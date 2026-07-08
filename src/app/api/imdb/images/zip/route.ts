import { NextRequest, NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import {
  fetchOfficialTitle,
  fetchTitleImages,
  type GalleryImage,
} from "@/lib/imdb";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Strip characters that are invalid in file names */
function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
}

/** RFC 5987 encoding for Content-Disposition filename* */
function rfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!/^tt\d{4,12}$/.test(id)) {
    return NextResponse.json({ error: "Некорректный IMDb ID" }, { status: 400 });
  }

  // Collect the full image list (metadata only) + the official title
  let images: GalleryImage[];
  let title: string;
  try {
    images = [];
    let token: string | undefined;
    for (let page = 0; page < 60; page++) {
      const p = await fetchTitleImages(id, token);
      images.push(...p.images);
      token = p.nextPageToken;
      if (!token) break;
    }
    title = safeFileName(await fetchOfficialTitle(id));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Не удалось получить галерею";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (images.length === 0) {
    return NextResponse.json(
      { error: "В галерее нет изображений" },
      { status: 404 },
    );
  }

  const zipName = `${title} img.zip`;
  const pad = String(images.length).length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          try {
            controller.error(err);
          } catch {}
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });

      try {
        // Sliding window: prefetch a few images ahead, append strictly in order
        const WINDOW = 4;
        const pending: (Promise<ArrayBuffer | null> | undefined)[] = [];
        for (let i = 0; i < Math.min(WINDOW, images.length); i++) {
          pending[i] = fetchImage(images[i].url);
        }
        for (let i = 0; i < images.length; i++) {
          const ahead = i + WINDOW;
          if (ahead < images.length) pending[ahead] = fetchImage(images[ahead].url);

          const buf = await pending[i];
          pending[i] = undefined; // release memory
          if (!buf) continue; // skip broken images

          // Respect backpressure: don't run far ahead of the client
          while ((controller.desiredSize ?? 1) <= 0) await sleep(50);

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
      }
    },
    cancel() {
      // client aborted the download — nothing to clean up, fetches will GC
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
