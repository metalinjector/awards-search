import { NextRequest, NextResponse } from "next/server";
import { validateTmdbKey, TMDB_SETTING_KEY } from "@/lib/tmdb";
import { deleteSetting, setSetting } from "@/lib/settings";
import {
  enforceRateLimit,
  readJsonBody,
  RequestBodyError,
  requireAdmin,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";

/** Save a TMDB API key entered in the UI (validated against TMDB first) */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const limited = enforceRateLimit(req, { name: "tmdb_key", limit: 5, windowMs: 60_000 });
  if (limited) return limited;
  let body: { key?: string };
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const bodyError = error instanceof RequestBodyError ? error : null;
    return NextResponse.json(
      { error: bodyError?.message ?? "Некорректный запрос" },
      { status: bodyError?.status ?? 400 },
    );
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (key.length < 10 || key.length > 400 || /\s/.test(key)) {
    return NextResponse.json(
      { error: "Ключ выглядит некорректно — проверьте, что скопировали его целиком" },
      { status: 400 },
    );
  }
  const valid = await validateTmdbKey(key);
  if (!valid) {
    return NextResponse.json(
      {
        error:
          "TMDB отклонил этот ключ. Убедитесь, что используете «API Key (v3 auth)» или «API Read Access Token» со страницы themoviedb.org/settings/api",
      },
      { status: 400 },
    );
  }
  await setSetting(TMDB_SETTING_KEY, key);
  return NextResponse.json({ ok: true });
}

/** Remove the saved key */
export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await deleteSetting(TMDB_SETTING_KEY);
  return NextResponse.json({ ok: true });
}
