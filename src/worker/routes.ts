// HTTP/WebSocket API. Admin routes require the shared-secret header.
// Every League route takes a League id (src/shared/leagues.ts):
//   GET  /api/leagues                      the Leagues: { default, leagues: [{ id, name, paused, n, live, stats, spend }] }
//   GET  /api/leagues/:id                  League snapshot (config, live tiles, recent results, leaderboard, spend)
//   GET  /api/leagues/:id/ws               League feed: the snapshot on join, then coalesced "tiles" diffs and "leaderboard" messages
//   POST /api/admin/leagues/:id/pause      running Matches finish, no new ones start
//   POST /api/admin/leagues/:id/resume
//   POST /api/admin/leagues/:id/config     partial { n, roster, seats, rulesetConfig, deadlines, seeds, spendCap,
//                                          startsPerWindow, startWindowMs, backoffMs, feedIntervalMs }
//   POST /api/admin/leagues/:id/featured   { matchId } pins a finished Match on the grid; null unpins
// The single-League routes /api/league[/ws] and /api/admin/league/:op are the default League (gemini-managed).
//   POST /api/admin/matches                start a one-off Match outside the League schedule ({ league } picks
//                                          the League that gets its cost; default gemini-managed)
//   GET  /api/matches/:id[/ws]             Match snapshot / Spectator feed

import type { DeadlineConfig } from "../core/deadlines";
import type { AgentConfig } from "../core/harness";
import { isLeagueId, leagueStub } from "../core/leagues";
import type { NarratorConfig } from "../core/narrator";
import { fakeRoster } from "../core/roster";
import { analystConfigError, type AnalystConfig } from "../core/analyst";
import { startMatch } from "../core/start-match";
import { narratorConfigError } from "../narrator";
import { DEFAULT_LEAGUE_ID, LEAGUES } from "../shared/leagues";
import { isAdmin } from "./auth";

const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
const noSuchLeague = (id: string) => Response.json({ error: `no such League: ${id}` }, { status: 404 });

const MATCH_ROUTE = /^\/api\/matches\/([\w-]+)(\/ws)?$/;
/** League feed and snapshot, by id or (old route) the default League. */
const LEAGUE_ROUTE = /^\/api\/(?:leagues\/([\w-]+)|league)(\/ws)?$/;
const ADMIN_ROUTE = /^\/api\/admin\/(?:leagues\/([\w-]+)|league)\/(pause|resume|config|featured)$/;

export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/api/health") return Response.json({ ok: true });

  if (url.pathname === "/api/leagues") {
    const leagues = await Promise.all(
      LEAGUES.map(async ({ id, name }) => {
        const s = await leagueStub(env, id).snapshot();
        return { id, name, paused: s.config.paused, n: s.config.n, live: s.tiles.length, stats: s.stats, spend: s.spend.total };
      }),
    );
    return Response.json({ default: DEFAULT_LEAGUE_ID, leagues });
  }

  const leagueRoute = LEAGUE_ROUTE.exec(url.pathname);
  if (leagueRoute) {
    const id = leagueRoute[1] ?? DEFAULT_LEAGUE_ID;
    if (!isLeagueId(id)) return noSuchLeague(id);
    const league = leagueStub(env, id);
    return leagueRoute[2] ? league.fetch(request) : Response.json(await league.snapshot());
  }

  const adminOp = ADMIN_ROUTE.exec(url.pathname);
  if (adminOp && request.method === "POST") {
    if (!isAdmin(request, env)) return unauthorized();
    const id = adminOp[1] ?? DEFAULT_LEAGUE_ID;
    if (!isLeagueId(id)) return noSuchLeague(id);
    const league = leagueStub(env, id);
    const op = adminOp[2];
    if (op === "pause") return Response.json(await league.pause());
    if (op === "resume") return Response.json(await league.resume());
    const body = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null) return Response.json({ error: "expected a JSON object" }, { status: 400 });
    if (op === "featured") {
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
      /** The League the Match reports to (its cost counts there; it is unrated). Default gemini-managed. */
      league?: string;
      /** Analyst for this Match, e.g. { harness: "managed-agent", model: "gemini-4-neon" }; default none. */
      analyst?: AnalystConfig | null;
    };
    const agents = body.agents?.length ? body.agents : fakeRoster();
    const narratorError = body.narrator == null ? null : narratorConfigError(body.narrator);
    if (narratorError) return Response.json({ error: narratorError }, { status: 400 });
    if (body.league !== undefined && (typeof body.league !== "string" || !isLeagueId(body.league))) {
      return Response.json({ error: `league must be one of ${LEAGUES.map((l) => l.id).join(", ")}` }, { status: 400 });
    }
    const analystError = body.analyst == null ? null : analystConfigError(body.analyst);
    if (analystError) return Response.json({ error: analystError }, { status: 400 });
    if (body.matchId !== undefined && !/^[\w-]{1,64}$/.test(body.matchId)) {
      return Response.json({ error: "matchId must be 1-64 word characters or dashes" }, { status: 400 });
    }
    try {
      const init = await startMatch(env, { matchId: body.matchId, seed: body.seed, config: body.config,
        deadlines: body.deadlines,
        narrator: body.narrator,
        league: body.league,
        analyst: body.analyst,
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
