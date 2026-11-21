import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { MatchResult } from "../../src/core/ruleset";
import type { LeagueDO } from "../../src/do/league";
import type { LeagueMessage, LeagueSnapshot } from "../../src/shared/protocol";
import { ADMIN, fakeAgent, snapshot, waitFor } from "./helpers";

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

/** Fast fake roster: every Agent ends turns at once. */
const roster = (n: number, opts: Record<string, unknown> = { delayPolls: 1 }) =>
  Array.from({ length: n }, (_, i) => fakeAgent(`lg-${i + 1}`, opts));

/** Pause and wait for running Matches to finish, so each test leaves a quiet League. */
async function drain() {
  await ok(admin("pause"));
  await waitFor(async () => (await league()).tiles.length === 0);
}

describe("League scheduling", () => {
  it("rejects every admin operation without the shared secret", async () => {
    for (const op of ["pause", "resume", "config"]) {
      expect((await admin(op, { n: 1 }, {})).status, op).toBe(401);
      expect((await admin(op, { n: 1 }, { "x-admin-secret": "wrong" })).status, op).toBe(401);
    }
    // Nothing changed.
    expect((await league()).config.paused).toBe(true);
  });

  it("keeps N Matches running, replaces finished ones, takes a new N and stops on pause", async () => {
    await ok(admin("config", { n: 2, roster: roster(3) }));
    await ok(admin("resume"));
    const two = await waitFor(async () => {
      const s = await league();
      return s.tiles.length === 2 ? s : null;
    });
    expect(two.config).toMatchObject({ n: 2, paused: false });

    // Finished Matches are replaced: more Matches start than were first started,
    // and the grid stays at N.
    const replaced = await waitFor(async () => {
      const s = await league();
      return s.stats.settled >= 2 && s.stats.started >= 4 ? s : null;
    });
    expect(replaced.tiles).toHaveLength(2);
    for (const t of replaced.recent) {
      expect((await snapshot(t.matchId)).status).toBe("finished");
    }

    await ok(admin("config", { n: 3 }));
    await waitFor(async () => (await league()).tiles.length === 3);

    await ok(admin("pause"));
    const atPause = (await league()).stats.started;
    await waitFor(async () => (await league()).tiles.length === 0);
    const after = await league();
    expect(after.stats.started).toBe(atPause);
    expect(after.config.paused).toBe(true);
    // Every started Match is settled once.
    expect(after.stats.settled).toBe(after.stats.started);
  });

  it("refuses a roster of fewer than 2 Agents", async () => {
    const before = (await league()).config.roster;
    for (const bad of [[], [fakeAgent("solo")], [fakeAgent("solo"), fakeAgent("solo")]]) {
      const res = await admin("config", { roster: bad });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/at least 2 Agents/);
    }
    expect((await league()).config.roster).toEqual(before);
  });

  it("never deals both Werewolf seats to one Agent, even from a 2-Agent roster", async () => {
    await ok(admin("config", { n: 3, roster: roster(2) }));
    await ok(admin("resume"));
    const s = await waitFor(async () => {
      const l = await league();
      return l.recent.length >= 10 ? l : null;
    });
    await drain();
    for (const { matchId } of s.recent) {
      const events = (await snapshot(matchId)).events;
      const seats = events.find((e) => e.kind === "match_setup")!.data.seats as { seat: number; agentId: string }[];
      const agentOf = new Map(seats.map((x) => [x.seat, x.agentId]));
      const wolves = events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
      expect(wolves).toHaveLength(2);
      expect(agentOf.get(wolves[0]!), matchId).not.toBe(agentOf.get(wolves[1]!));
      expect(new Set(agentOf.values()).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("a result delivered twice (first acknowledgement lost) starts exactly one replacement Match", async () => {
    const stub = env.LEAGUE.getByName("default");
    const calls: { matchId: string; duplicate: boolean }[] = [];
    // Lose the League's first acknowledgement: it settles, but the Match sees a failure.
    // (RPC dispatches through the prototype, so the wrapper goes there.)
    let restore = () => {};
    await runInDurableObject(stub, (instance: LeagueDO) => {
      const proto = Object.getPrototypeOf(instance) as LeagueDO;
      const original = proto.reportMatchResult;
      restore = () => {
        proto.reportMatchResult = original;
      };
      let lose = true;
      proto.reportMatchResult = async function (this: LeagueDO, matchId: string, result: MatchResult) {
        const ack = await original.call(this, matchId, result);
        calls.push({ matchId, duplicate: ack.duplicate });
        if (lose) {
          lose = false;
          throw new Error("acknowledgement lost");
        }
        return ack;
      };
    });
    const before = await league();
    await ok(admin("config", { n: 1, roster: roster(3) }));
    await ok(admin("resume"));
    const first = (await waitFor(async () => (await league()).tiles[0])).matchId;

    // The Match redelivers until acknowledged; the League recognises the duplicate.
    await waitFor(async () => calls.filter((c) => c.matchId === first).length >= 2);
    expect(calls.filter((c) => c.matchId === first).slice(0, 2).map((c) => c.duplicate)).toEqual([false, true]);
    // The replacement took the only slot.
    const mid = await league();
    expect(mid.tiles.map((t) => t.matchId)).not.toContain(first);
    expect(mid.tiles).toHaveLength(1);

    // A further redelivery is still a no-op.
    const again = await stub.reportMatchResult(first, (await snapshot(first)).result!);
    expect(again.duplicate).toBe(true);

    await drain();
    restore();
    const after = await league();
    // Each Match was settled once: settlements match starts, and the first appears once.
    expect(after.stats.settled - before.stats.settled).toBe(after.stats.started - before.stats.started);
    expect(after.recent.filter((r) => r.matchId === first)).toHaveLength(1);
  });
});

describe("League feed", () => {
  it("sends the snapshot on join, then live tile updates as a Match progresses", async () => {
    const res = await exports.default.fetch("http://test/api/league/ws", { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const messages: LeagueMessage[] = [];
    ws.addEventListener("message", (m) => messages.push(JSON.parse(m.data as string)));
    ws.accept();
    await waitFor(async () => messages.length >= 1);
    expect(messages[0]!.type).toBe("league");
    expect(messages[0]!.league.config.paused).toBe(true);

    await ok(admin("config", { n: 1, roster: roster(3, { delayPolls: 3 }) }));
    await ok(admin("resume"));
    // The tile's summary moves from Night 1 to Day 1.
    const day = await waitFor(async () => messages.find((m) => m.league.tiles[0]?.summary?.phase === "Day")?.league.tiles[0]);
    expect(day.summary).toMatchObject({ phase: "Day", round: 1 });
    const night = messages.find((m) => m.league.tiles[0]?.summary?.phase === "Night")!.league.tiles[0]!;
    expect(night.matchId).toBe(day.matchId);
    expect(night.summary).toMatchObject({ round: 1, alive: [1, 2, 3, 4, 5, 6, 7], latestSpeech: null });
    expect(day.seats).toHaveLength(7);
    // When the Match ends its tile gives way to a new Match.
    await waitFor(async () => messages.some((m) => m.league.tiles[0] && m.league.tiles[0].matchId !== day.matchId));
    await drain();
    ws.close(1000, "bye");
  });
});
