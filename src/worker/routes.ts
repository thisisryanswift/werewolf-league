// HTTP/WebSocket API. Admin routes require the shared-secret header.
//   GET  /api/league                 League snapshot (config, live tiles, recent results)
//   GET  /api/league/ws              League feed: the snapshot on join and on every change
//   POST /api/admin/league/pause     running Matches finish, no new ones start
//   POST /api/admin/league/resume
//   POST /api/admin/league/config    partial { n, roster, seats, rulesetConfig }
//   POST /api/admin/matches          start a one-off Match outside the League schedule
//   GET  /api/matches/:id[/ws]       Match snapshot / Spectator feed

import type { AgentConfig } from "../core/harness";
import { fakeRoster, LEAGUE_NAME } from "../core/roster";
import { startMatch } from "../core/start-match";
import { isAdmin } from "./auth";

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

const MATCH_ROUTE = /^\/api\/matches\/([\w-]+)(\/ws)?$/;

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return Response.json({ ok: true });

  const league = env.LEAGUE.getByName(LEAGUE_NAME);
  if (url.pathname === "/api/league") return Response.json(await league.snapshot());
  if (url.pathname === "/api/league/ws") return league.fetch(request);

  const adminOp = /^\/api\/admin\/league\/(pause|resume|config)$/.exec(url.pathname);
  if (adminOp && request.method === "POST") {
    if (!isAdmin(request, env)) return unauthorized();
    if (adminOp[1] === "pause") return Response.json(await league.pause());
    if (adminOp[1] === "resume") return Response.json(await league.resume());
    const body = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return Response.json({ error: "expected a JSON object" }, { status: 400 });
    const r = await league.configure(body as Record<string, unknown>);
    return r.ok ? Response.json(r.league) : Response.json({ error: r.error }, { status: 400 });
  }

  if (url.pathname === "/api/admin/matches" && request.method === "POST") {
    if (!isAdmin(request, env)) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as {
      /** Optional; lets a caller retry a failed start under the same ID. */
      matchId?: string;
      seed?: string;
      config?: Record<string, unknown>;
      agents?: AgentConfig[];
    };
    const agents = body.agents?.length ? body.agents : fakeRoster();
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
