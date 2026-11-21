// HTTP/WebSocket API. Admin routes require the shared-secret header.
// League routes (snapshot, feed, pause/resume/set N) are added alongside.

import type { AgentConfig } from "../core/harness";
import { startMatch } from "../core/start-match";
import { isAdmin } from "./auth";

/** Default table for a fake demo Match: 7 scripted Agents that answer after a few polls. */
function defaultFakeAgents(): AgentConfig[] {
  return ["Ada", "Bo", "Cy", "Di", "Ed", "Flo", "Gus"].map((name) => ({
    id: `fake-${name.toLowerCase()}`,
    name,
    harness: "fake",
    options: { script: "first-legal", delayPolls: 1 },
  }));
}

const MATCH_ROUTE = /^\/api\/matches\/([\w-]+)(\/ws)?$/;

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return Response.json({ ok: true });

  if (url.pathname === "/api/admin/matches" && request.method === "POST") {
    if (!isAdmin(request, env)) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as {
      /** Optional; lets a caller retry a failed start under the same ID. */
      matchId?: string;
      seed?: string;
      config?: Record<string, unknown>;
      agents?: AgentConfig[];
    };
    const agents = body.agents?.length ? body.agents : defaultFakeAgents();
    if (body.matchId !== undefined && !/^[\w-]{1,64}$/.test(body.matchId)) {
      return Response.json({ error: "matchId must be 1-64 word characters or dashes" }, { status: 400 });
    }
    try {
      const init = await startMatch(env, { matchId: body.matchId, seed: body.seed, config: body.config, agents });
      return Response.json({ matchId: init.matchId, seed: init.seed }, { status: 201 });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 400 });
    }
  }

  const m = MATCH_ROUTE.exec(url.pathname);
  if (m) {
    const stub = env.MATCH.getByName(m[1]!);
    if (m[2]) return stub.fetch(request);
    const snap = await stub.snapshot();
    return snap ? Response.json(snap) : Response.json({ error: "no such match" }, { status: 404 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
