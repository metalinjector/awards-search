import { createHash, timingSafeEqual } from "node:crypto";

/** Admin actions (managing the stored TMDB key) are enabled only when ADMIN_TOKEN is set */
export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_TOKEN);
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Constant-time check of the `x-admin-token` request header */
export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.headers.get("x-admin-token");
  if (!expected || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}
