// League at scale (wl-d5wn): staggered starts, 429 backoff and the coalesced
// feed, end to end through the Worker, the League DO and real Match/Player DOs.
// The League's clock is faked and its alarm driven by hand where time matters.
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { LeagueDO } from "../../src/do/league";
import type { LeagueSnapshot } from "../../src/shared/protocol";
import { ADMIN, connectLeague, fakeAgent, UNPACED, waitFor } from "./helpers";

const stub = () => env.LEAGUE.getByName("default");

async function league(): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch("http://test/api/league");
  if (!res.ok) throw new Error(`league snapshot failed: ${res.status}`);
  return res.json();
}

async function admin(op: string, body: unknown = {}): Promise<LeagueSnapshot> {
  const res = await exports.default.fetch(`http://test/api/admin/league/${op}`, {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${op}: ${res.status} ${await res.text()}`);
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One-cycle Matches whose Agents answer after about a second, so dozens run cheaply. */
const SHORT = { rulesetConfig: { maxCycles: 1 } };
const slowRoster = (prefix: string, opts: Record<string, unknown> = {}) =>
  ["a", "b", "c"].map((x) => fakeAgent(`${prefix}-${x}`, { delayPolls: 1, pollEveryMs: 1000, ...opts }));

/**
 * Replace the League's clock with a manual one, starting well in the past so
 * nothing it records lands in the real future. `advance` moves it and runs the
 * League's alarm, as if that much time had passed.
 */
let restoreClock = () => {};
async function fakeClock() {
  const clock = { t: Date.now() - 30 * 60_000 };
  await runInDurableObject(stub(), (instance: LeagueDO) => {
    const proto = Object.getPrototypeOf(instance) as LeagueDO;
    const original = proto.now;
    proto.now = () => clock.t;
    restoreClock = () => {
      proto.now = original;
    };
  });
  return {
    advance: async (ms: number) => {
      clock.t += ms;
      return runDurableObjectAlarm(stub());
    },
  };
}

/** Pause and wait for running Matches to finish, then restore the defaults these tests changed. */
async function drain() {
  await admin("pause");
  await waitFor(async () => (await league()).tiles.length === 0, 90_000);
  await admin("config", { ...UNPACED, deadlines: {}, rulesetConfig: {} });
}

afterEach(() => {
  restoreClock();
  restoreClock = () => {};
});

describe("League at scale", () => {
  it("defaults to N = 24 (up to 36), and set-N takes effect live", async () => {
    const s = await league();
    expect(s.config).toMatchObject({ n: 24, startsPerWindow: 4, startWindowMs: 30_000, backoffMs: 60_000, feedIntervalMs: 500 });
    expect((await admin("config", { n: 36 })).config.n).toBe(36);
    await expect(admin("config", { n: 37 })).rejects.toThrow(/400/);
  });

  it("ramps from empty to N = 24 starting at most 4 Matches per 30 s window", { timeout: 150_000 }, async () => {
    const time = await fakeClock();
    await admin("config", { ...SHORT, n: 24, startsPerWindow: 4, startWindowMs: 30_000, roster: slowRoster("ramp") });
    const base = (await league()).stats.started;
    await admin("resume");

    const startedPerWindow: number[] = [];
    let total = 0;
    for (let window = 0; total < 24; window++) {
      if (window > 0) expect(await time.advance(30_000), "the League is waiting for the next window").toBe(true);
      const expected = Math.min(24, total + 4);
      await waitFor(async () => (await league()).stats.started - base >= expected);
      // No more Matches start until the window ends, however long we wait.
      await sleep(300);
      const s = await league();
      startedPerWindow.push(s.stats.started - base - total);
      total = s.stats.started - base;
      expect(window).toBeLessThan(10);
    }
    expect(startedPerWindow).toEqual([4, 4, 4, 4, 4, 4]);
    // All 24 are live at once (none has finished yet), and every tile starts running.
    const full = await waitFor(async () => {
      const s = await league();
      return s.tiles.length === 24 && s.tiles.every((t) => t.status === "running") ? s : null;
    });
    expect(full.tiles).toHaveLength(24);

    // Lowering N live lets running Matches finish without replacements.
    await admin("config", { n: 2 });
    await drain();
  });

  it("stops starting Matches for the backoff period after a Player reports a 429", { timeout: 120_000 }, async () => {
    const time = await fakeClock();
    // Seat 1's Agent is refused with a 429 on the first poll of its first turn.
    const roster = [fakeAgent("rl-429", { delayPolls: 1, pollEveryMs: 200, rateLimitTurns: [1] }), ...slowRoster("rl")];
    await admin("config", { ...UNPACED, ...SHORT, n: 1, backoffMs: 60_000, roster });
    const before = await league();
    await admin("resume");

    const limited = await waitFor(async () => {
      const s = await league();
      return s.rateLimit.count > before.rateLimit.count ? s : null;
    });
    expect(limited.rateLimit.backoffUntil).not.toBeNull();
    expect(limited.rateLimit.recent[0]).toMatchObject({ agentId: "rl-429", source: "poll" });
    const startedAt429 = limited.stats.started;

    // Raising N during the backoff starts nothing.
    await admin("config", { n: 3 });
    await sleep(500);
    expect((await league()).stats.started).toBe(startedAt429);
    // Not even when the League wakes before the backoff ends.
    await time.advance(30_000);
    expect((await league()).stats.started).toBe(startedAt429);

    // Once it ends, new Matches start again.
    await time.advance(30_001);
    const resumed = await waitFor(async () => {
      const s = await league();
      return s.stats.started > startedAt429 ? s : null;
    });
    expect(resumed.stats.started).toBeGreaterThan(startedAt429);
    // Drain on the fake clock: 429s reported meanwhile then back off only until a time already past.
    await drain();
  });
});

describe("League feed at scale", () => {
  it("coalesces a burst of Match events into a bounded number of small per-tile diffs", { timeout: 90_000 }, async () => {
    // Agents that never answer, on a long first turn: the Match sits still while we burst.
    await admin("config", {
      ...UNPACED,
      ...SHORT,
      n: 1,
      feedIntervalMs: 300,
      deadlines: { firstTurnMs: 5_000, turnMs: 500, graceMs: 100 },
      roster: slowRoster("burst", { script: "silent" }),
    });
    const feed = await connectLeague();
    await admin("resume");
    const tile = await waitFor(async () => feed.latest().tiles.find((t) => t.summary && t.status === "running"));

    const sent = feed.messages.length;
    const began = Date.now();
    const burst = 100;
    for (let i = 0; i < burst; i++) {
      await stub().updateTile(tile.matchId, { ...tile.summary!, latestSpeech: { seat: 1, text: `line ${i}` } }, 1_000_000 + i);
    }
    await sleep(700); // let the trailing message go out
    const elapsed = Date.now() - began;
    const during = feed.messages.slice(sent);

    // At most one message per feed interval (plus the leading one), never one per event.
    expect(during.length).toBeGreaterThan(0);
    expect(during.length).toBeLessThanOrEqual(Math.ceil(elapsed / 300) + 1);
    expect(during.length).toBeLessThan(burst / 4);
    for (const m of during) {
      expect(m.type).toBe("tiles");
      if (m.type !== "tiles") continue;
      for (const d of m.tiles.filter((d) => d.matchId === tile.matchId)) {
        // A diff of a known tile, not the whole tile again.
        expect(d).not.toHaveProperty("seats");
        expect(d).not.toHaveProperty("seed");
      }
    }
    // The grid ends up with the last line.
    expect(feed.latest().tiles.find((t) => t.matchId === tile.matchId)!.summary!.latestSpeech).toEqual({ seat: 1, text: `line ${burst - 1}` });
    feed.close();
    await drain();
  });

  it("tile summaries carry phase, Day/Night number, step tag, alive, thinking, timeouts and the latest speech", { timeout: 90_000 }, async () => {
    // One Agent misses its first turn, so the tile counts a timeout.
    const roster = [fakeAgent("ts-late", { silentTurns: [1], say: "hello" }), fakeAgent("ts-b", { say: "I suspect seat 3." }), fakeAgent("ts-c")];
    await admin("config", { ...UNPACED, ...SHORT, n: 1, deadlines: { firstTurnMs: 400, turnMs: 400, graceMs: 100 }, roster });
    const feed = await connectLeague();
    await admin("resume");
    const tiles = () => feed.states.flatMap((s) => s.tiles);
    const thinkingAtNight = await waitFor(async () => tiles().find((t) => t.summary?.phase === "Night" && t.summary.thinking > 0));
    expect(thinkingAtNight.summary).toMatchObject({ round: 1, step: "Night actions" });
    expect(thinkingAtNight.seats).toHaveLength(7);
    const speaking = await waitFor(async () =>
      tiles().find((t) => t.summary?.phase === "Day" && t.summary.latestSpeech && t.summary.timeouts > 0 && t.summary.step?.startsWith("Speech Round")),
    );
    const s = speaking.summary!;
    expect(s.round).toBe(1);
    expect(s.alive.length).toBeGreaterThan(0);
    expect(s.alive.length).toBeLessThanOrEqual(7);
    expect(typeof s.thinking).toBe("number");
    expect(s.latestSpeech).toMatchObject({ text: expect.any(String) });
    // God View roles for the pips. (Drama fields are the Narrator's, wl-pbkx.)
    expect(Object.keys(s.godView!.roles)).toHaveLength(7);
    feed.close();
    await drain();
  });
});
