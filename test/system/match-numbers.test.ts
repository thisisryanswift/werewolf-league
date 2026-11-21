// Match Numbers (wl-ks6l): the League numbers the Matches it starts 1, 2, 3, ...
// This file runs its own League ("numbers"), so its count starts at 1.
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LeagueDO, Settlement } from "../../src/do/league";
import type { LeagueSnapshot } from "../../src/shared/protocol";
import { connect, fakeAgent, snapshot, startMatch, UNPACED, waitFor } from "./helpers";

const stub = () => env.LEAGUE.getByName("numbers");
const league = (): Promise<LeagueSnapshot> => stub().snapshot();
/** One-cycle Matches keep the test quick under full-suite load. */
const SHORT = { rulesetConfig: { maxCycles: 1 } };
const roster = ["a", "b", "c"].map((x) => fakeAgent(`mn-${x}`, { delayPolls: 1 }));
/** Under full-suite load Matches run slowly: wait well past waitFor's default. */
const LOADED_MS = 90_000;

async function drain(): Promise<LeagueSnapshot> {
  await stub().pause();
  return waitFor(async () => {
    const s = await league();
    return s.tiles.length === 0 ? s : null;
  }, LOADED_MS);
}

/** Every settlement this League has recorded (the snapshot's `recent` keeps only the latest 12). */
const settlements = () =>
  runInDurableObject(stub(), async (_instance: LeagueDO, state) => [...state.storage.kv.list<Settlement>({ prefix: "settled:" })].map(([, s]) => s));

describe("Match Numbers", () => {
  it("numbers a League's Matches consecutively from 1, through replacements and a pause/resume", { timeout: 4 * LOADED_MS }, async () => {
    const r = await stub().configure({ ...UNPACED, ...SHORT, n: 2, roster });
    if (!r.ok) throw new Error(r.error);
    await stub().resume();
    await waitFor(async () => (await league()).stats.settled >= 3, LOADED_MS);
    const first = await drain();

    await stub().resume();
    await waitFor(async () => (await league()).stats.settled >= first.stats.settled + 2, LOADED_MS);
    const s = await drain();

    // Every Match the League started settled with a number: exactly 1..started.
    const all = await settlements();
    expect(all).toHaveLength(s.stats.started);
    const numbers = all.map((m) => m.matchNumber).sort((a, b) => a! - b!);
    expect(numbers).toEqual(Array.from({ length: s.stats.started }, (_, i) => i + 1));
    // The finished list and each Match's own metadata carry the same number, and so does its Match log.
    const byId = new Map(all.map((m) => [m.matchId, m.matchNumber]));
    for (const m of s.recent) {
      expect(m.matchNumber, m.matchId).toBe(byId.get(m.matchId));
      expect((await snapshot(m.matchId)).matchNumber, m.matchId).toBe(m.matchNumber);
    }
    const spectator = await connect(s.recent[0]!.matchId);
    await waitFor(async () => spectator.messages.length >= 1, LOADED_MS);
    spectator.close();
    expect(spectator.messages[0]).toMatchObject({ type: "log", matchNumber: s.recent[0]!.matchNumber });
    // A pinned Match keeps its number.
    const pin = await stub().setFeatured(all.find((m) => m.matchNumber === 1)!.matchId);
    expect(pin.ok && pin.league.featured).toMatchObject({ matchNumber: 1, pinned: true });
  });

  it("shows the number on live tiles", { timeout: 3 * LOADED_MS }, async () => {
    const before = (await league()).stats.started;
    await stub().resume();
    const tile = await waitFor(async () => (await league()).tiles.find((t) => t.matchNumber !== undefined), LOADED_MS);
    expect(tile.matchNumber).toBeGreaterThan(before);
    await drain();
  });

  it("a Match the League did not start has no number", { timeout: 2 * LOADED_MS }, async () => {
    const matchId = await startMatch({ seed: "unnumbered", agents: Array.from({ length: 7 }, (_, i) => fakeAgent(`mn1-${i}`)) });
    const done = await waitFor(async () => {
      const m = await snapshot(matchId);
      return m.status === "finished" ? m : null;
    }, LOADED_MS);
    expect(done.matchNumber).toBeUndefined();
  });
});
