import { describe, expect, it } from "vitest";
import type { MatchEvent } from "../../src/shared/protocol";
import { decisions, fakeAgent, finished, startMatch } from "./helpers";

/** Every seat speaks, accusing the seat after it, and echoes a digest of its observation. */
const speaker = (i: number, extra: Record<string, unknown> = {}) =>
  fakeAgent(`talker-${i + 1}`, {
    args: { speak: { text: `seat ${i + 1} speaks`, accuse: [((i + 1) % 7) + 1] } },
    echo: "text",
    ...extra,
  });

const speechesOf = (events: MatchEvent[], cycle: number, round: string) =>
  events.filter((e) => e.kind === "speech" && e.data.cycle === cycle && e.data.round === round);

describe("Day through real Match and Player DOs", () => {
  it("resolves a Speech Round identically whatever order the speeches arrive in", async () => {
    const fastFirst = Array.from({ length: 7 }, (_, i) => speaker(i, { delayPolls: i }));
    const slowFirst = Array.from({ length: 7 }, (_, i) => speaker(i, { delayPolls: 6 - i }));
    const [a, b] = await Promise.all([
      startMatch({ seed: "arrival", agents: fastFirst }),
      startMatch({ seed: "arrival", agents: slowFirst }),
    ]);
    const [sa, sb] = await Promise.all([finished(a), finished(b)]);
    expect(decisions(sa.events)).toEqual(decisions(sb.events));

    // Each round is committed contiguously, in seat order from that Day's starting seat.
    const roundA = speechesOf(sa.events, 1, "A");
    const killed = sa.events.find((e) => e.kind === "player_died" && e.data.cycle === 1)?.data.seat;
    const living = [1, 2, 3, 4, 5, 6, 7].filter((s) => s !== killed);
    expect(roundA).toHaveLength(living.length);
    expect(roundA.map((e) => e.seq)).toEqual(roundA.map((_, i) => roundA[0]!.seq + i));
    const start = living.indexOf(roundA[0]!.data.seat as number);
    expect(roundA.map((e) => e.data.seat)).toEqual(living.map((_, i) => living[(start + i) % living.length]));
    expect(speechesOf(sa.events, 1, "B").map((e) => e.data.seat)).toEqual(roundA.map((e) => e.data.seat));
    expect(sa.events.some((e) => e.kind === "replier_chosen")).toBe(true);
    expect(speechesOf(sa.events, 1, "reply").length).toBeGreaterThan(0);
  });

  it("a seat retrying an illegal call sees the same frozen observation, without its own round's speeches", async () => {
    // Odd seats answer late and illegally first, so their retry comes after the rest of the round has spoken.
    const sloppy = Array.from({ length: 7 }, (_, i) => speaker(i, i % 2 === 0 ? { invalidFirst: true, delayPolls: 3 } : {}));
    const clean = Array.from({ length: 7 }, (_, i) => speaker(i));
    const [s1, s2] = await Promise.all([
      finished(await startMatch({ seed: "frozen", agents: sloppy })),
      finished(await startMatch({ seed: "frozen", agents: clean })),
    ]);
    // Each speech carries a digest of the observation its speaker was shown.
    expect(speechesOf(s1.events, 1, "A")[0]!.data.text).toMatch(/\[obs [0-9a-f]{8}\]/);
    expect(decisions(s1.events)).toEqual(decisions(s2.events));
  });

  it("reports normalized belief ballots in the Match result", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => speaker(i));
    const snap = await finished(await startMatch({ seed: "ballots", agents }));
    const ballots = snap.result as unknown as { ballots: { seat: number; round: number; beliefs: Record<string, number> }[] };
    expect(ballots.ballots.length).toBeGreaterThan(0);
    const recorded = snap.events.filter((e) => e.kind === "beliefs_recorded");
    expect(recorded.every((e) => Array.isArray(e.audience) && e.audience.length === 0)).toBe(true);
    expect(ballots.ballots.filter((b) => b.round === 1)).toEqual(
      (recorded[0]!.data.ballots as { seat: number; beliefs: Record<string, number> }[]).map((b) => ({ ...b, round: 1 })),
    );
  });
});
