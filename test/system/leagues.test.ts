// Multiple Leagues (wl-2lfo): each League is its own League DO with its own
// roster, config, Side Ratings, spend and admin controls. Whole system: real
// League, Match and Player DOs and alarms, driven through the HTTP routes; no
// model is ever called.

import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import type { LeagueSnapshot } from "../../src/shared/protocol";
import { ADMIN, connectLeague, fakeAgent, snapshot, UNPACED, waitFor } from "./helpers";

// Scripted usage, so every settled Match has a non-zero cost to attribute.
const USAGE = { input: 1_000, cached: 0, thought: 100, output: 100 };
const agent = (id: string): AgentConfig => ({ ...fakeAgent(id, { delayPolls: 1, usage: USAGE }), model: "gemini-3.5-flash-lite" });
const roster = (prefix: string) => [1, 2, 3].map((i) => agent(`${prefix}-${i}`));

async function league(id: string): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch(`http://test/api/leagues/${id}`);
  if (!res.ok) throw new Error(`league ${id} snapshot failed: ${res.status}`);
  return res.json();
}

function admin(id: string, op: string, body?: unknown, headers: Record<string, string> = ADMIN) {
  return exports.default.fetch(`http://test/api/admin/leagues/${id}/${op}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function ok(res: Promise<Response>) {
  const r = await res;
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// At most 2 starts a second per League, so the two Leagues don't load the rest of the suite.
const PACED = { ...UNPACED, startsPerWindow: 1, startWindowMs: 500 };
const ids = (s: LeagueSnapshot) => s.leaderboard.rows.filter((r) => r.matches > 0).map((r) => r.agentId);

describe("multiple Leagues", () => {
  it("seeds gemini-managed (the default) and pi-open, which starts paused on the pi Harness roster", async () => {
    const res = await exports.default.fetch("http://test/api/leagues");
    const list = (await res.json()) as { default: string; leagues: { id: string; name: string; paused: boolean }[] };
    expect(list.default).toBe("gemini-managed");
    expect(list.leagues.map((l) => l.id)).toEqual(["gemini-managed", "pi-open"]);

    const pi = await league("pi-open");
    expect(pi.league).toMatchObject({ id: "pi-open" });
    expect(pi.config.paused).toBe(true);
    expect(pi.tiles).toEqual([]);
    expect(pi.config.roster.map((a) => a.name)).toEqual(["Hydrogen · Pi", "Claude Haiku 5.5 · Pi", "DeepSeek V4.1 Flash · Pi"]);
    expect(pi.config.roster.every((a) => a.harness === "pi")).toBe(true);

    expect((await exports.default.fetch("http://test/api/leagues/nope")).status).toBe(404);
    expect((await admin("nope", "pause")).status).toBe(404);
  });

  it("the old single-League routes are the gemini-managed League, whose League DO is the one deployed as 'default'", async () => {
    // State written straight to the deployed League DO name...
    await env.LEAGUE.getByName("default").configure({ n: 5 });
    // ...is the gemini-managed League on both the new and the old routes.
    expect((await league("gemini-managed")).config.n).toBe(5);
    const old = (await (await exports.default.fetch("http://test/api/league")).json()) as LeagueSnapshot;
    expect(old.config.n).toBe(5);
    expect(old.league).toMatchObject({ id: "gemini-managed" });
    await ok(admin("gemini-managed", "config", { n: 24 }));
  });

  it("requires the shared secret for every admin operation on every League", async () => {
    for (const id of ["gemini-managed", "pi-open"]) {
      for (const op of ["pause", "resume", "config", "featured"]) {
        expect((await admin(id, op, { n: 1 }, {})).status, `${id} ${op}`).toBe(401);
        expect((await admin(id, op, { n: 1 }, { "x-admin-secret": "wrong" })).status, `${id} ${op}`).toBe(401);
      }
    }
    expect((await league("pi-open")).config.paused).toBe(true);
  });

  it("runs two Leagues concurrently; each Match settles ratings and spend to its own League; pausing one leaves the other running", async () => {
    await ok(admin("gemini-managed", "config", { ...PACED, n: 1, roster: roster("gm") }));
    await ok(admin("pi-open", "config", { ...PACED, n: 1, roster: roster("pi") }));
    const gmFeed = await connectLeague(() => exports.default.fetch("http://test/api/leagues/gemini-managed/ws", { headers: { Upgrade: "websocket" } }));
    const piFeed = await connectLeague(() => exports.default.fetch("http://test/api/leagues/pi-open/ws", { headers: { Upgrade: "websocket" } }));
    await ok(admin("gemini-managed", "resume"));
    await ok(admin("pi-open", "resume"));

    // Both Leagues settle Matches.
    await waitFor(async () => (await league("gemini-managed")).stats.settled >= 2 && (await league("pi-open")).stats.settled >= 2);

    const gm = await league("gemini-managed");
    const pi = await league("pi-open");
    // Ratings: each leaderboard has rated only its own Agents.
    expect(ids(gm).length).toBeGreaterThan(0);
    expect(ids(pi).length).toBeGreaterThan(0);
    expect(ids(gm).every((id) => id.startsWith("gm-"))).toBe(true);
    expect(ids(pi).every((id) => id.startsWith("pi-"))).toBe(true);
    expect(pi.leaderboard.rows.some((r) => r.agentId.startsWith("gm-"))).toBe(false);
    // Spend: per-Agent spend only for the League's own Agents, and both are non-zero.
    expect(Object.keys(gm.spend.byAgent).every((id) => id.startsWith("gm-"))).toBe(true);
    expect(Object.keys(pi.spend.byAgent).every((id) => id.startsWith("pi-"))).toBe(true);
    expect(gm.spend.total).toBeGreaterThan(0);
    expect(pi.spend.total).toBeGreaterThan(0);
    // Matches record their League, and each finished one is in its own League's results only.
    const gmMatch = gm.recent[0]!.matchId;
    const piMatch = pi.recent[0]!.matchId;
    expect((await snapshot(gmMatch)).league).toBe("gemini-managed");
    expect((await snapshot(piMatch)).league).toBe("pi-open");
    expect(pi.recent.some((m) => m.matchId === gmMatch)).toBe(false);
    expect(gm.recent.some((m) => m.matchId === piMatch)).toBe(false);
    // Each feed carries only its own League's tiles.
    expect(gmFeed.messages.some((m) => m.type === "tiles" && m.tiles.some((t) => t.seats?.some((s) => s.agentId.startsWith("pi-"))))).toBe(false);
    expect(piFeed.messages.some((m) => m.type === "tiles" && m.tiles.some((t) => t.seats?.some((s) => s.agentId.startsWith("gm-"))))).toBe(false);

    // Pause pi-open: it drains, while gemini-managed keeps starting replacements.
    await ok(admin("pi-open", "pause"));
    await waitFor(async () => (await league("pi-open")).tiles.length === 0);
    const piStarted = (await league("pi-open")).stats.started;
    const gmStarted = (await league("gemini-managed")).stats.started;
    await waitFor(async () => (await league("gemini-managed")).stats.started >= gmStarted + 1);
    const gmAfter = await league("gemini-managed");
    expect(gmAfter.config.paused).toBe(false);
    expect(gmAfter.tiles.length).toBeGreaterThan(0);
    expect((await league("pi-open")).stats.started).toBe(piStarted);

    gmFeed.close();
    piFeed.close();
    await ok(admin("gemini-managed", "pause"));
    await waitFor(async () => (await league("gemini-managed")).tiles.length === 0);
  });
});
