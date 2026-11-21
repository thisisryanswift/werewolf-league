// Match Numbers (wl-ks6l): the League numbers the Matches it starts 1, 2, 3, ...
// This file runs its own League ("numbers"), so its count starts at 1.
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { LeagueSnapshot } from "../../src/shared/protocol";
import { connect, fakeAgent, finished, snapshot, startMatch, UNPACED, waitFor } from "./helpers";

const stub = () => env.LEAGUE.getByName("numbers");
const league = (): Promise<LeagueSnapshot> => stub().snapshot();
const roster = ["a", "b", "c"].map((x) => fakeAgent(`mn-${x}`, { delayPolls: 1 }));

async function drain(): Promise<LeagueSnapshot> {
  await stub().pause();
  return waitFor(async () => {
    const s = await league();
    return s.tiles.length === 0 ? s : null;
  });
}

describe("Match Numbers", () => {
  it("numbers a League's Matches consecutively from 1, through replacements and a pause/resume", async () => {
    const r = await stub().configure({ ...UNPACED, n: 2, roster });
    if (!r.ok) throw new Error(r.error);
    await stub().resume();
    await waitFor(async () => (await league()).stats.settled >= 3);
    const first = await drain();

    await stub().resume();
    await waitFor(async () => (await league()).stats.settled >= first.stats.settled + 2);
    const s = await drain();

    expect(s.stats.started).toBeLessThanOrEqual(12); // all still in `recent`
    const numbers = s.recent.map((m) => m.matchNumber).sort((a, b) => a! - b!);
    expect(numbers).toEqual(Array.from({ length: s.stats.started }, (_, i) => i + 1));
    // Each Match's own metadata carries the same number, and so does its Match log.
    for (const m of s.recent) {
      expect((await snapshot(m.matchId)).matchNumber, m.matchId).toBe(m.matchNumber);
    }
    const spectator = await connect(s.recent[0]!.matchId);
    await waitFor(async () => spectator.messages.length >= 1);
    spectator.close();
    expect(spectator.messages[0]).toMatchObject({ type: "log", matchNumber: s.recent[0]!.matchNumber });
    // A pinned Match keeps its number.
    const pin = await stub().setFeatured(s.recent.at(-1)!.matchId);
    expect(pin.ok && pin.league.featured).toMatchObject({ matchNumber: 1, pinned: true });
  });

  it("shows the number on live tiles", async () => {
    const before = (await league()).stats.started;
    await stub().resume();
    const tile = await waitFor(async () => (await league()).tiles.find((t) => t.matchNumber !== undefined));
    expect(tile.matchNumber).toBeGreaterThan(before);
    await drain();
  });

  it("a Match the League did not start has no number", async () => {
    const matchId = await startMatch({ seed: "unnumbered", agents: Array.from({ length: 7 }, (_, i) => fakeAgent(`mn1-${i}`)) });
    expect((await finished(matchId)).matchNumber).toBeUndefined();
  });
});
