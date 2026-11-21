// Calibration (Brier) and Table Suspicion fixtures, through the Werewolf Ruleset
// with hand-written actions. The scoring functions are ruleset-agnostic: they
// only see the ballots, each Player's Side and the Side the beliefs guess at.
import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { calibrationBySeat, tableSuspicion, type Ballot } from "../../src/shared/beliefs";
import type { RulesetEvent } from "../../src/shared/protocol";
import { act, day1Vote, nightKill, speakUntilVote, vote } from "./helpers";

const ballotsIn = (events: RulesetEvent[]): Ballot[] =>
  events.filter((e) => e.kind === "beliefs_recorded").flatMap((e) => e.data.ballots as Ballot[]);

/** Round to 12 places so float noise doesn't hide exact fractions. */
const r12 = (x: number) => Number(x.toFixed(12));

describe("Calibration and Table Suspicion fixture", () => {
  // Day 1 (7 alive, 2 wolves): v1 casts a concentrated village ballot on w1, w1 casts a
  // wolf ballot on v1, v2 times out (no ballot), everyone else times out too. Nobody is
  // eliminated, nobody dies in Night 2. Day 2: v1 casts an empty ballot (uniform).
  function play() {
    const t = day1Vote("beliefs");
    const [w1, w2] = t.wolves as [number, number];
    const [v1, v2, v3, v4, v5] = t.villagers as [number, number, number, number, number];
    const d1 = act(t.state, (s) => (s === v1 ? vote("abstain", { [w1]: 1 }) : s === w1 ? vote("abstain", { [v1]: 1 }) : null));
    const s = speakUntilVote(nightKill(d1.state, null).state).state;
    const d2 = act(s, (seat) => (seat === v1 ? vote("abstain", {}) : null));
    return { t, w1, w2, v1, v2, v3, v4, v5, day1: ballotsIn(d1.events), day2: ballotsIn(d2.events), state: d2.state };
  }

  it("records one ballot per non-timed-out vote", () => {
    const { day1, day2, v1, w1 } = play();
    expect(day1.map((b) => b.seat).sort()).toEqual([v1, w1].sort());
    expect(day2.map((b) => b.seat)).toEqual([v1]);
  });

  it("Table Suspicion: the mean of every ballot that rates a Player, wolf ballots included, cumulative over votes", () => {
    const { day1, day2, w1, w2, v1, v2, v3, v4, v5 } = play();
    const round = (m: Record<number, { mean: number; ballots: number }>) =>
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { mean: r12(v.mean), ballots: v.ballots }]));

    // After Day 1: v1's ballot is w1 = 1, everyone else 0.2 (excess spread); w1's ballot is v1 = 1, rest 0.
    expect(round(tableSuspicion(day1))).toEqual({
      [w1]: { mean: 1, ballots: 1 },
      [w2]: { mean: 0.1, ballots: 2 },
      [v1]: { mean: 1, ballots: 1 },
      [v2]: { mean: 0.1, ballots: 2 },
      [v3]: { mean: 0.1, ballots: 2 },
      [v4]: { mean: 0.1, ballots: 2 },
      [v5]: { mean: 0.1, ballots: 2 },
    });
    // After Day 2 adds v1's uniform ballot (1/3 each): w1 (1 + 1/3)/2 = 2/3; the others (0.2 + 0 + 1/3)/3 = 8/45.
    const eight45 = r12(8 / 45);
    expect(round(tableSuspicion([...day1, ...day2]))).toEqual({
      [w1]: { mean: r12(2 / 3), ballots: 2 },
      [w2]: { mean: eight45, ballots: 3 },
      [v1]: { mean: 1, ballots: 1 },
      [v2]: { mean: eight45, ballots: 3 },
      [v3]: { mean: eight45, ballots: 3 },
      [v4]: { mean: eight45, ballots: 3 },
      [v5]: { mean: eight45, ballots: 3 },
    });
  });

  it("Brier scores village ballots only, per belief, against the true Sides", () => {
    const { state, v1 } = play();
    // Settle the Match result without finishing it: Sides come from the result shape.
    const result = werewolf.result({ ...state, winner: "village" })!;
    expect(result.beliefSide).toBe("wolf");
    const scores = calibrationBySeat({ ballots: result.ballots!, sides: result.sides, beliefSide: result.beliefSide! });
    // Only v1 is scored: w1's wolf ballot is not, and the timed-out seats cast none.
    expect(Object.keys(scores).map(Number)).toEqual([v1]);
    // Day 1: w1 (1-1)^2 = 0, w2 (1-0.2)^2 = 0.64, four villagers 0.2^2 = 0.04 each -> 0.8 over 6 beliefs.
    // Day 2: uniform 1/3: two wolves (2/3)^2, four villagers (1/3)^2 -> 8/9 + 4/9 = 4/3 over 6.
    // Total 0.8 + 4/3 = 32/15 over 12 beliefs: Brier 8/45.
    expect(r12(scores[v1]!.sum)).toBe(r12(32 / 15));
    expect(scores[v1]!.n).toBe(12);
    expect(r12(scores[v1]!.sum / scores[v1]!.n)).toBe(r12(8 / 45));
  });
});
