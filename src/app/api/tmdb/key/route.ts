import { NextRequest } from "next/server";
import { adminEnabled, isAdmin } from "@/lib/admin";
import { jsonError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import { deleteSetting, setSetting } from "@/lib/settings";
import { TMDB_SETTING_KEY, validateTmdbKey } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

/** The stored key is shared by all visitors, so changing it requires the admin token */
function authorize(req: NextRequest): Response | null {
  const limited = rateLimited(req, "admin");
  if (limited) return limited;
  if (!adminEnabled()) {
    return jsonError(
      "Управление ключом через интерфейс отключено: задайте TMDB_API_KEY в окружении сервера или ADMIN_TOKEN, чтобы сохранять ключ здесь.",
      403,
    );
  }
  if (!isAdmin(req)) return jsonError("Неверный токен администратора", 401);
  return null;
}

/** Save a TMDB API key entered in the UI (validated against TMDB first) */
export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Некорректный запрос", 400);
  }
  const key = String(body.key ?? "").trim();
  if (key.length < 10 || key.length > 400 || /\s/.test(key)) {
    return jsonError(
      "Ключ выглядит некорректно — проверьте, что скопировали его целиком",
      400,
    );
  }
  if (!(await validateTmdbKey(key))) {
    return jsonError(
      "TMDB отклонил этот ключ. Убедитесь, что используете «API Key (v3 auth)» или «API Read Access Token» со страницы themoviedb.org/settings/api",
      400,
    );
  }
  await setSetting(TMDB_SETTING_KEY, key);
  return Response.json({ ok: true });
}

/** Remove the saved key */
export async function DELETE(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  await deleteSetting(TMDB_SETTING_KEY);
  return Response.json({ ok: true });
}
