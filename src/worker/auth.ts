/** True if the request carries the admin shared secret in `x-admin-secret`. */
export function isAdmin(request: Request, env: Env): boolean {
  const secret = env.ADMIN_SECRET;
  const given = request.headers.get("x-admin-secret");
  if (!secret || !given) return false;
  const a = new TextEncoder().encode(secret);
  const b = new TextEncoder().encode(given);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
