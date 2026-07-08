import { NextRequest, NextResponse } from "next/server";
import { validateTmdbKey, TMDB_SETTING_KEY } from "@/lib/tmdb";
import { deleteSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Save a TMDB API key entered in the UI (validated against TMDB first) */
export async function POST(req: NextRequest) {
  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
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
export async function DELETE() {
  await deleteSetting(TMDB_SETTING_KEY);
  return NextResponse.json({ ok: true });
}
