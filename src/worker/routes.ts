export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return Response.json({ ok: true });
  return Response.json({ error: "not found" }, { status: 404 });
}
