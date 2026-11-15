import { NextRequest } from "next/server";
import { jsonError } from "@/lib/api";
import { searchKinopoiskFilms } from "@/lib/kp-suggest";
import { errorText, log } from "@/lib/log";
import { rateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 200) {
    return jsonError("Введите название фильма (минимум 2 символа)", 400);
  }
  const limited = rateLimited(req, "kpSuggest");
  if (limited) return limited;
  try {
    return Response.json({ results: await searchKinopoiskFilms(q) });
  } catch (err) {
    log.warn("kp-suggest", "search failed", { error: errorText(err) });
    return jsonError(
      "Не удалось выполнить поиск на Кинопоиске — попробуйте ещё раз",
      502,
    );
  }
}
