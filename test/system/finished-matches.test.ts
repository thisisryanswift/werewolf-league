import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { LeagueSnapshot } from "../../src/shared/protocol";
import { ADMIN, connect, decisions, fakeAgent, finished, startMatch, UNPACED, waitFor } from "./helpers";

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

function admin(op: string, body?: unknown, headers: Record<string, string> = ADMIN) {
  return exports.default.fetch(`http://test/api/admin/league/${op}`, {
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

const table = (prefix: string, opts: Record<string, unknown> = { delayPolls: 1 }) =>
  Array.from({ length: 7 }, (_, i) => fakeAgent(`${prefix}-${i + 1}`, opts));

/** Run the League until at least `count` Matches have finished, then pause and drain. */
async function runLeagueUntil(count: number): Promise<LeagueSnapshot> {
  await ok(admin("config", { ...UNPACED, n: 2, roster: table("fm").slice(0, 3) }));
  await ok(admin("resume"));
  await waitFor(async () => (await league()).recent.length >= count);
  await ok(admin("pause"));
  return waitFor(async () => {
    const s = await league();
    return s.tiles.length === 0 ? s : null;
  });
}

describe("Finished Matches", () => {
  it("a finished Match opens with its full event log", async () => {
    const matchId = await startMatch({ seed: "finished-replay", agents: table("fr") });
    const done = await finished(matchId);
    const spectator = await connect(matchId);
    await waitFor(async () => spectator.messages.length >= 1);
    spectator.close();

    expect(spectator.messages).toHaveLength(1);
    const [log] = spectator.messages;
    expect(log?.type).toBe("log");
    const events = log!.type === "log" ? log!.events : [];
    expect(events.map((e) => e.seq)).toEqual(Array.from({ length: done.events.length }, (_, i) => i + 1));
    expect(decisions(events)).toEqual(decisions(done.events));
    expect(events.filter((e) => e.kind !== "match_cost").at(-1)?.kind).toBe("match_over");
  });

  it("features the most recent finished Match until an operator pins one", async () => {
    const s = await runLeagueUntil(2);
    expect(s.featured).toMatchObject({ ...s.recent[0], pinned: false });

    // Pin an older finished Match.
    const older = s.recent[1]!;
    const pinned = (await ok(admin("featured", { matchId: older.matchId }))) as LeagueSnapshot;
    expect(pinned.featured).toMatchObject({ matchId: older.matchId, winner: older.winner, pinned: true });
    expect((await league()).featured?.matchId).toBe(older.matchId);

    // The pin survives newer Matches finishing.
    await runLeagueUntil(s.recent.length + 1);
    expect((await league()).featured).toMatchObject({ matchId: older.matchId, pinned: true });

    // Clearing the pin falls back to the most recent finished Match.
    const cleared = (await ok(admin("featured", { matchId: null }))) as LeagueSnapshot;
    expect(cleared.featured).toMatchObject({ ...cleared.recent[0], pinned: false });
  });

  it("can pin a finished one-off Match that is not in the recent list", async () => {
    const matchId = await startMatch({ seed: "one-off-featured", agents: table("oo") });
    const done = await finished(matchId);
    const s = (await ok(admin("featured", { matchId }))) as LeagueSnapshot;
    expect(s.featured).toMatchObject({ matchId, winner: done.result!.winner, pinned: true });
    await ok(admin("featured", { matchId: null }));
  });

  it("refuses to feature a Match that has not finished, and requires the shared secret", async () => {
    expect((await admin("featured", { matchId: "no-such-match" })).status).toBe(400);
    expect((await admin("featured", { matchId: 42 })).status).toBe(400);
    expect((await admin("featured", {})).status).toBe(400);

    const running = await startMatch({ seed: "still-running", agents: table("sr", { delayPolls: 50 }) });
    const res = await admin("featured", { matchId: running });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/not finished/);

    const before = (await league()).featured;
    expect((await admin("featured", { matchId: null }, {})).status).toBe(401);
    expect((await admin("featured", { matchId: null }, { "x-admin-secret": "wrong" })).status).toBe(401);
    expect((await league()).featured).toEqual(before);
  });
});
