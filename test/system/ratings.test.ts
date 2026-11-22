// Side Ratings and the leaderboard, through real League/Match/Player DOs.
// Each Match is scripted: the League deals from an operator-queued match seed,
// and the test picks seeds whose table has a known shape so every expected
// rating is a hand-worked literal.
import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { drawTable } from "../../src/core/draw";
import type { MatchReport } from "../../src/core/match";
import type { AgentRecord } from "../../src/core/ratings";
import type { LeagueDO } from "../../src/do/league";
import { werewolf } from "../../src/rulesets/werewolf";
import type { AgentStanding, LeagueMessage, LeagueSnapshot, MatchEvent, RatingChanges } from "../../src/shared/protocol";
import { ADMIN, fakeAgent, snapshot, UNPACED, waitFor } from "./helpers";

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

async function admin(op: string, body: unknown = {}) {
  const res = await exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${op}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<LeagueSnapshot>;
}

/** Village Players vote out the wolves (in seat order); wolves vote for each other. Village wins on Day 2. */
const villageWins = (id: string, wolves: number[]) => fakeAgent(id, { prefer: wolves });
/** Everyone abstains and nobody kills: the 6-cycle cap gives the wolves the win. */
const wolvesWin = (id: string) => fakeAgent(id, { script: "passive" });

type Deal = { wolves: string[]; village: string[]; wolfSeats: number[] };

/** The table the League deals for this seed and roster (same draw and deal as the League). */
function dealFor(seed: string, ids: string[]): Deal {
  const roster = ids.map((id) => fakeAgent(id));
  const draw = drawTable({
    roster,
    seats: 7,
    seed,
    check: (seats) => {
      const r = werewolf.setup({}, seed, seats);
      return r.ok ? null : r.error;
    },
  });
  if (!draw.ok) throw new Error(draw.error);
  const r = werewolf.setup({}, seed, draw.seats);
  if (!r.ok) throw new Error(r.error);
  const wolfSeats = r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
  const agentOf = (seat: number) => draw.seats[seat - 1]!.agentId;
  const sorted = (xs: string[]) => [...xs].sort();
  return {
    wolfSeats,
    wolves: sorted(wolfSeats.map(agentOf)),
    village: sorted(draw.seats.filter((s) => !wolfSeats.includes(s.seat)).map((s) => s.agentId)),
  };
}

/** The first seed `${prefix}-<i>` whose deal has exactly these wolf and village Agents (as sorted lists). */
function seedWith(prefix: string, ids: string[], want: { wolves: string[]; village: string[] }) {
  for (let i = 0; i < 2000; i++) {
    const seed = `${prefix}-${i}`;
    const deal = dealFor(seed, ids);
    if (JSON.stringify(deal.wolves) === JSON.stringify(want.wolves) && JSON.stringify(deal.village) === JSON.stringify(want.village)) {
      return { seed, ...deal };
    }
  }
  throw new Error(`no seed for ${JSON.stringify(want)}`);
}

/** Run exactly one League Match on the queued seed and wait for it to settle. */
async function playOne(seed: string, roster: ReturnType<typeof fakeAgent>[]): Promise<string> {
  await admin("config", { ...UNPACED, n: 1, roster, seeds: [seed] });
  const started = await admin("resume");
  await admin("pause");
  const tile = started.tiles.find((t) => t.seed === seed);
  if (!tile) throw new Error("the queued seed was not used");
  await waitFor(async () => (await league()).recent.some((r) => r.matchId === tile.matchId));
  return tile.matchId;
}

/** The Match's ratings_settled event, once the Match has committed it (the Match may not have started yet). */
const ratingsEvent = (matchId: string) =>
  waitFor(async () => (await snapshot(matchId).catch(() => null))?.events.find((e) => e.kind === "ratings_settled"));

const standing = (l: LeagueSnapshot, agentId: string): AgentStanding => {
  const row = l.leaderboard.rows.find((r) => r.agentId === agentId);
  if (!row) throw new Error(`${agentId} not on the leaderboard`);
  return row;
};

const rounded = (row: AgentStanding) => ({
  wolf: Number(row.ratings.wolf!.toFixed(4)),
  village: Number(row.ratings.village!.toFixed(4)),
  overall: Number(row.overall.toFixed(4)),
});

describe("Side Ratings", () => {
  it("rate each Player from one pre-Match snapshot with team-average Elo, K=32", async () => {
    // Match 1, everyone at 1200: A has one wolf seat and 3 village seats, B one wolf and 2 village. Village wins.
    const m1 = seedWith("elo-m1", ["elo-a", "elo-b"], { wolves: ["elo-a", "elo-b"], village: ["elo-a", "elo-a", "elo-a", "elo-b", "elo-b"] });
    const id1 = await playOne(m1.seed, [villageWins("elo-a", m1.wolfSeats), villageWins("elo-b", m1.wolfSeats)]);
    expect((await snapshot(id1)).result?.winner).toBe("village");

    const after1 = await league();
    expect(after1.leaderboard.sides).toEqual(["wolf", "village"]);
    // Equal averages: each Player moves 16. A: wolf 1200-16, village 1200+3*16; B: wolf 1184, village 1200+2*16.
    expect(rounded(standing(after1, "elo-a"))).toEqual({ wolf: 1184, village: 1248, overall: 1216 });
    expect(rounded(standing(after1, "elo-b"))).toEqual({ wolf: 1184, village: 1232, overall: 1208 });
    expect(standing(after1, "elo-a")).toMatchObject({ matches: 1, wins: { wolf: 0, village: 1 }, timeouts: 0 });

    // Match 2: A and the new C. Wolves A + C, village A, A, C, C, C. Wolves win at the cycle cap.
    // Snapshot: wolf average (1184 + 1200) / 2 = 1192; village average (2*1248 + 3*1200) / 5 = 1219.2.
    // E(wolf) = 1 / (1 + 10^(27.2/400)) = 0.460936..., so each wolf Player gains 32 * (1 - E) = 17.2501...
    // and each village Player loses the same.
    const m2 = seedWith("elo-m2", ["elo-a", "elo-c"], { wolves: ["elo-a", "elo-c"], village: ["elo-a", "elo-a", "elo-c", "elo-c", "elo-c"] });
    const id2 = await playOne(m2.seed, [wolvesWin("elo-a"), wolvesWin("elo-c")]);
    expect((await snapshot(id2)).result?.winner).toBe("wolf");

    const after2 = await league();
    expect(rounded(standing(after2, "elo-a"))).toEqual({ wolf: 1201.2501, village: 1213.4999, overall: 1207.375 });
    expect(rounded(standing(after2, "elo-c"))).toEqual({ wolf: 1217.2501, village: 1148.2498, overall: 1182.7499 });
    expect(standing(after2, "elo-a")).toMatchObject({ matches: 2, wins: { wolf: 1, village: 1 } });
    // B didn't play.
    expect(rounded(standing(after2, "elo-b"))).toEqual({ wolf: 1184, village: 1232, overall: 1208 });
    // Ranked by Overall Rating.
    const order = after2.leaderboard.rows.map((r) => r.agentId).filter((id) => id.startsWith("elo-"));
    expect(order).toEqual(["elo-b", "elo-a", "elo-c"]);

    // The Match end event reports each Player's and each Agent's change.
    const e2 = (await ratingsEvent(id2)).data as unknown as RatingChanges;
    const a = e2.agents.filter((x) => x.agentId === "elo-a").map((x) => ({ side: x.side, delta: Number(x.delta.toFixed(4)) }));
    expect(a).toEqual([
      { side: "wolf", delta: 17.2501 },
      { side: "village", delta: -34.5001 },
    ]);
    expect(e2.players).toHaveLength(7);
    expect(e2.players.filter((p) => p.side === "wolf").every((p) => p.won)).toBe(true);
  });

  it("rates concurrent Matches from the snapshot taken when each table was drawn", async () => {
    // Two Matches drawn together, both from all-1200 ratings. Each has one snap-x and one
    // snap-y wolf (never two of one Agent), and the wolves win both. Rated from the draw-time
    // snapshot, every Player moves exactly 16 and each Agent's Wolf Rating ends at 1200 + 2*16,
    // even though the second settlement happens after the first has moved the ratings.
    const roster = [wolvesWin("snap-x"), wolvesWin("snap-y")];
    await admin("config", { ...UNPACED, n: 2, roster, seeds: ["snap-1", "snap-2"] });
    const started = await admin("resume");
    await admin("pause");
    const ids = started.tiles.filter((t) => t.seed.startsWith("snap-")).map((t) => t.matchId);
    expect(ids).toHaveLength(2);
    for (const id of ids) {
      const changes = (await ratingsEvent(id)).data as unknown as RatingChanges;
      expect(changes.players.map((p) => [p.before, Math.abs(p.delta)])).toEqual(Array.from({ length: 7 }, () => [1200, 16]));
    }
    const l = await league();
    expect(standing(l, "snap-x").ratings.wolf).toBe(1232);
    expect(standing(l, "snap-y").ratings.wolf).toBe(1232);
  });

  it("updates the leaderboard live over the League feed when a Match finishes", async () => {
    const res = await exports.default.fetch("http://test/api/league/ws", { headers: { Upgrade: "websocket" } });
    const ws = res.webSocket!;
    const messages: LeagueMessage[] = [];
    ws.addEventListener("message", (m) => messages.push(JSON.parse(m.data as string)));
    ws.accept();
    await waitFor(async () => messages.length >= 1);

    const m = seedWith("live", ["live-a", "live-b"], { wolves: ["live-a", "live-b"], village: ["live-a", "live-a", "live-a", "live-b", "live-b"] });
    const matchId = await playOne(m.seed, [villageWins("live-a", m.wolfSeats), villageWins("live-b", m.wolfSeats)]);
    // The settlement pushes its own leaderboard message, naming the Match that moved it.
    const update = await waitFor(async () => messages.find((x) => x.type === "leaderboard" && x.matchId === matchId));
    if (update.type !== "leaderboard") throw new Error("unreachable");
    const row = update.leaderboard.rows.find((r) => r.agentId === "live-a")!;
    expect(row).toMatchObject({ ratings: { wolf: 1184, village: 1248 }, overall: 1216, matches: 1 });
    expect(messages.filter((x) => x.type === "leaderboard" && x.matchId === matchId)).toHaveLength(1);
    // The joining snapshot carried the leaderboard from before the Match.
    const joined = messages[0]!;
    if (joined.type !== "league") throw new Error("expected the snapshot first");
    expect(joined.league.leaderboard.rows.find((r) => r.agentId === "live-a")?.overall ?? 1200).toBe(1200);
    ws.close(1000, "bye");
  });

  it("a result delivered twice (first acknowledgement lost) applies one rating update with identical deltas, two copies on the winning side", async () => {
    // D has 3 village seats (copies) on the winning side.
    const m = seedWith("dup", ["dup-d", "dup-e"], { wolves: ["dup-d", "dup-e"], village: ["dup-d", "dup-d", "dup-d", "dup-e", "dup-e"] });
    const stub = env.LEAGUE.getByName("default");
    const calls: { matchId: string; duplicate: boolean; changes: RatingChanges | null }[] = [];
    let restore = () => {};
    await runInDurableObject(stub, (instance: LeagueDO) => {
      const proto = Object.getPrototypeOf(instance) as LeagueDO;
      const original = proto.reportMatchResult;
      restore = () => {
        proto.reportMatchResult = original;
      };
      const lost = new Set<string>();
      proto.reportMatchResult = async function (this: LeagueDO, matchId: string, result: MatchReport) {
        const ack = await original.call(this, matchId, result);
        calls.push({ matchId, duplicate: ack.duplicate, changes: ack.settlement.ratings });
        if (ack.settlement.seats && !lost.has(matchId)) {
          lost.add(matchId);
          throw new Error("acknowledgement lost");
        }
        return ack;
      };
    });
    let matchId: string;
    try {
      matchId = await playOne(m.seed, [villageWins("dup-d", m.wolfSeats), villageWins("dup-e", m.wolfSeats)]);
      await waitFor(async () => calls.filter((c) => c.matchId === matchId).length >= 2);
    } finally {
      restore();
    }
    const mine = calls.filter((c) => c.matchId === matchId);
    expect(mine.slice(0, 2).map((c) => c.duplicate)).toEqual([false, true]);
    expect(mine[1]!.changes).toEqual(mine[0]!.changes);

    // Exactly one update: each of D's three winning copies adds 16 from the same 1200 snapshot.
    const l = await league();
    expect(standing(l, "dup-d")).toMatchObject({ ratings: { wolf: 1184, village: 1248 }, matches: 1, wins: { wolf: 0, village: 1 } });
    expect(standing(l, "dup-e")).toMatchObject({ ratings: { wolf: 1184, village: 1232 } });

    // The Match end event: committed once, with the same deltas as the League's settlement.
    const event = await ratingsEvent(matchId);
    const events: MatchEvent[] = (await snapshot(matchId)).events;
    expect(events.filter((e) => e.kind === "ratings_settled")).toHaveLength(1);
    const changes = event.data as unknown as RatingChanges;
    expect(changes).toEqual(mine[0]!.changes);
    const dVillage = changes.players.filter((p) => p.agentId === "dup-d" && p.side === "village");
    expect(dVillage.map((p) => [p.before, p.delta, p.won])).toEqual([
      [1200, 16, true],
      [1200, 16, true],
      [1200, 16, true],
    ]);
    expect(changes.agents.find((x) => x.agentId === "dup-d" && x.side === "village")).toEqual({
      agentId: "dup-d",
      side: "village",
      before: 1200,
      delta: 48,
      after: 1248,
    });

    // A third delivery changes nothing and returns the original deltas.
    const again = await stub.reportMatchResult(matchId, (await snapshot(matchId)).result as unknown as MatchReport);
    expect(again.duplicate).toBe(true);
    expect(again.settlement.ratings).toEqual(changes);
    expect(standing(await league(), "dup-d").ratings.village).toBe(1248);
  });

  it("counts Matches played per Side once per Match, backfilling records stored before the count existed", async () => {
    // F has one wolf seat and three village copies; G one wolf and two village. Village wins.
    const m1 = seedWith("pf-m1", ["pf-f", "pf-g"], { wolves: ["pf-f", "pf-g"], village: ["pf-f", "pf-f", "pf-f", "pf-g", "pf-g"] });
    await playOne(m1.seed, [villageWins("pf-f", m1.wolfSeats), villageWins("pf-g", m1.wolfSeats)]);
    expect(standing(await league(), "pf-f")).toMatchObject({ matches: 1, wins: { wolf: 0, village: 1 }, played: { wolf: 1, village: 1 } });

    // Simulate records stored before `played` existed.
    const stub = env.LEAGUE.getByName("default");
    await runInDurableObject(stub, (instance: LeagueDO) => {
      const kv = (instance as unknown as { ctx: DurableObjectState }).ctx.storage.kv;
      const records = kv.get<Record<string, AgentRecord>>("agents")!;
      kv.put("agents", Object.fromEntries(Object.entries(records).map(([id, { played: _, ...r }]) => [id, r])));
    });

    const after1 = await league();
    expect(standing(after1, "pf-f").played).toEqual({ wolf: 1, village: 1 });
    expect(standing(after1, "pf-g").played).toEqual({ wolf: 1, village: 1 });
    // Persisted once: every stored record now carries its count.
    await runInDurableObject(stub, (instance: LeagueDO) => {
      const kv = (instance as unknown as { ctx: DurableObjectState }).ctx.storage.kv;
      const records = kv.get<Record<string, AgentRecord>>("agents")!;
      expect(Object.values(records).every((r) => r.played)).toBe(true);
      expect(records["pf-f"]!.played).toEqual({ wolf: 1, village: 1 });
    });

    // Later settlements increment: F is village only this time, H wolf only. Wolves win.
    const ids = ["pf-f", "pf-h", "pf-i"];
    const seed2 = Array.from({ length: 2000 }, (_, i) => `pf-m2-${i}`).find((seed) => {
      const d = dealFor(seed, ids);
      return !d.wolves.includes("pf-f") && d.wolves.includes("pf-h") && !d.village.includes("pf-h");
    })!;
    await playOne(seed2, ids.map(wolvesWin));
    const after2 = await league();
    expect(standing(after2, "pf-f")).toMatchObject({ matches: 2, wins: { wolf: 0, village: 1 }, played: { wolf: 1, village: 2 } });
    expect(standing(after2, "pf-h")).toMatchObject({ matches: 1, wins: { wolf: 1, village: 0 }, played: { wolf: 1, village: 0 } });
    expect(standing(after2, "pf-g").played).toEqual({ wolf: 1, village: 1 });
  });

  it("counts per-role wins once per Match, and backfills Matches settled before role stats from each Match", async () => {
    // F has one wolf seat and three village seats; G one wolf and two village. Village wins.
    const m = seedWith("rs-m1", ["rs-f", "rs-g"], { wolves: ["rs-f", "rs-g"], village: ["rs-f", "rs-f", "rs-f", "rs-g", "rs-g"] });
    const matchId = await playOne(m.seed, [villageWins("rs-f", m.wolfSeats), villageWins("rs-g", m.wolfSeats)]);

    // Expected tallies from the Match's own role_assigned events: one per role held, won unless werewolf.
    const matchStub = env.MATCH.getByName(matchId);
    const events = await runInDurableObject(matchStub, (instance: { snapshot(): { events: MatchEvent[]; seats: { seat: number; agentId: string }[] } | null }) => instance.snapshot()!);
    const expected: Record<string, Record<string, { played: number; won: number }>> = { "rs-f": {}, "rs-g": {} };
    for (const e of events.events.filter((x) => x.kind === "role_assigned")) {
      const agentId = events.seats.find((s) => s.seat === e.data.seat)!.agentId;
      expected[agentId]![e.data.role as string] = { played: 1, won: e.data.role === "werewolf" ? 0 : 1 };
    }
    expect(Object.keys(expected["rs-f"]!)).toContain("werewolf");

    const zero = { werewolf: { played: 0, won: 0 }, seer: { played: 0, won: 0 }, doctor: { played: 0, won: 0 }, villager: { played: 0, won: 0 } };
    const before = await league();
    expect(before.leaderboard.roles?.map((r) => r.name)).toEqual(["Werewolf", "Seer", "Doctor", "Villager"]);
    expect(standing(before, "rs-f").roles).toEqual({ ...zero, ...expected["rs-f"] });
    expect(standing(before, "rs-g").roles).toEqual({ ...zero, ...expected["rs-g"] });
    const allBefore = before.leaderboard.rows.map((r) => [r.agentId, r.roles]);

    // Simulate a League from before role stats: no role tallies, no roles on settlements or on this Match's result.
    const stub = env.LEAGUE.getByName("default");
    await runInDurableObject(stub, (instance: LeagueDO) => {
      const kv = (instance as unknown as { ctx: DurableObjectState }).ctx.storage.kv;
      const records = kv.get<Record<string, AgentRecord>>("agents")!;
      kv.put("agents", Object.fromEntries(Object.entries(records).map(([id, { roles: _, ...r }]) => [id, r])));
      for (const [key, s] of kv.list<{ result: { roles?: unknown } }>({ prefix: "settled:" })) {
        const { roles: _, ...result } = s.result;
        kv.put(key, { ...s, result });
      }
      kv.delete("rolesBackfilled");
    });
    await runInDurableObject(matchStub, (instance: unknown) => {
      const kv = (instance as { ctx: DurableObjectState }).ctx.storage.kv;
      const meta = kv.get<{ result: { roles?: unknown } }>("meta")!;
      const { roles: _, ...result } = meta.result;
      kv.put("meta", { ...meta, result });
    });

    // A read serves partial data and starts the backfill; it completes in the background.
    const partial = await league();
    expect(partial.leaderboard.rolesComplete).toBe(false);
    const after = await waitFor(async () => {
      const l = await league();
      return l.leaderboard.rolesComplete ? l : null;
    });
    expect(after.leaderboard.rows.map((r) => [r.agentId, r.roles])).toEqual(allBefore);

    // Idempotent: another batch finds nothing to do and changes nothing.
    expect(await stub.backfillRoles()).toEqual({ remaining: 0, progressed: 0 });
    expect((await league()).leaderboard.rows.map((r) => [r.agentId, r.roles])).toEqual(allBefore);
  });

  it("leaves Matches the League did not start unrated", async () => {
    const stub = env.LEAGUE.getByName("default");
    const ack = await stub.reportMatchResult("one-off-unrated", {
      winner: "village",
      sides: { 1: "wolf", 2: "village" },
      timeouts: { bySeat: {}, byAgent: {} },
    });
    expect(ack.settlement.ratings).toBeNull();
  });
});
