// HTTP/WebSocket API. Admin routes require the shared-secret header.
//   GET  /api/league                 League snapshot (config, live tiles, recent results)
//   GET  /api/league/ws              League feed: the snapshot on join, then coalesced "tiles" diffs and "leaderboard" messages
//   POST /api/admin/league/pause     running Matches finish, no new ones start
//   POST /api/admin/league/resume
//   POST /api/admin/league/config    partial { n, roster, seats, rulesetConfig, deadlines, seeds,
//                                    startsPerWindow, startWindowMs, backoffMs, feedIntervalMs }
//   POST /api/admin/league/featured  { matchId } pins a finished Match on the grid; null unpins
//   POST /api/admin/matches          start a one-off Match outside the League schedule
//   GET  /api/matches/:id[/ws]       Match snapshot / Spectator feed

import type { DeadlineConfig } from "../core/deadlines";
import type { AgentConfig } from "../core/harness";
import type { NarratorConfig } from "../core/narrator";
import { fakeRoster, LEAGUE_NAME } from "../core/roster";
import { startMatch } from "../core/start-match";
import { narratorConfigError } from "../narrator";
import { isAdmin } from "./auth";
import { sweepSandboxes } from "../harness/pi";

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

const MATCH_ROUTE = /^\/api\/matches\/([\w-]+)(\/ws)?$/;

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return Response.json({ ok: true });

  const league = env.LEAGUE.getByName(LEAGUE_NAME);
  if (url.pathname === "/api/league") return Response.json(await league.snapshot());
  if (url.pathname === "/api/league/ws") return league.fetch(request);

  const adminOp = /^\/api\/admin\/league\/(pause|resume|config|featured)$/.exec(url.pathname);
  if (adminOp && request.method === "POST") {
    if (!isAdmin(request, env)) return unauthorized();
    if (adminOp[1] === "pause") {
      const paused = await league.pause();
      // Best effort and bounded: pause never waits long on the sandbox provider.
      await Promise.race([sweepSandboxes(env.AGENT37_API_KEY), new Promise((r) => setTimeout(r, 5_000))]);
      return Response.json(paused);
    }
    if (adminOp[1] === "resume") return Response.json(await league.resume());
    const body = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return Response.json({ error: "expected a JSON object" }, { status: 400 });
    if (adminOp[1] === "featured") {
      const { matchId } = body as { matchId?: unknown };
      if (matchId !== null && (typeof matchId !== "string" || !/^[\w-]{1,64}$/.test(matchId))) {
        return Response.json({ error: "matchId must be a Match ID or null" }, { status: 400 });
      }
      const f = await league.setFeatured(matchId);
      return f.ok ? Response.json(f.league) : Response.json({ error: f.error }, { status: 400 });
    }
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
      /** Turn deadlines in ms: { turnMs, firstTurnMs, graceMs }. Defaults 60 s / 90 s / 15 s. */
      deadlines?: Partial<DeadlineConfig>;
      agents?: AgentConfig[];
      /** Narrator for this Match, e.g. { id: "fake", options } or { id: "decisions" }; default none. */
      narrator?: NarratorConfig | null;
    };
    const agents = body.agents?.length ? body.agents : fakeRoster();
    const narratorError = body.narrator == null ? null : narratorConfigError(body.narrator);
    if (narratorError) return Response.json({ error: narratorError }, { status: 400 });
    if (body.matchId !== undefined && !/^[\w-]{1,64}$/.test(body.matchId)) {
      return Response.json({ error: "matchId must be 1-64 word characters or dashes" }, { status: 400 });
    }
    try {
      const init = await startMatch(env, { matchId: body.matchId, seed: body.seed, config: body.config,
        deadlines: body.deadlines,
        narrator: body.narrator,
        agents,
      });
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
