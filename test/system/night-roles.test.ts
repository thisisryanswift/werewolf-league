import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { fakeAgent, finished, startMatch } from "./helpers";

/** The deal the Ruleset makes for a 7-seat table of distinct Agents with this seed. */
function dealFor(seed: string) {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `x${i}`, label: "x" }));
  const r = werewolf.setup({}, seed, seats);
  if (!r.ok) throw new Error(r.error);
  const seatOf = (role: string) => r.state.players.find((p) => p.role === role)!.seat;
  const wolves = r.state.players.filter((p) => p.role === "werewolf").map((p) => p.seat);
  const plain = r.state.players.filter((p) => p.role === "villager").map((p) => p.seat);
  return { wolves, plain, seer: seatOf("seer"), doctor: seatOf("doctor") };
}

describe("a 7-seat fake Match with every role", () => {
  it("runs Wolf Chat, Pack Leader splits, Seer inspections and Doctor saves through the real DOs", async () => {
    const seed = "all-roles";
    const { wolves, plain, seer, doctor } = dealFor(seed);
    const [w1, w2] = wolves as [number, number];
    const [a, b, c] = plain as [number, number, number];
    // The wolves always split (w1 wants a, w2 wants b); the Doctor guards a, then b; the
    // Seer inspects w1. Village seats abstain on votes so the Match is decided at Night.
    const agents = Array.from({ length: 7 }, (_, i) => {
      const seat = i + 1;
      if (seat === w1) return fakeAgent(`wolf-${seat}`, { say: `w${seat} says hi`, prefer: [a, b, c] });
      if (seat === w2) return fakeAgent(`wolf-${seat}`, { say: `w${seat} says hi`, prefer: [b, a, c] });
      if (seat === seer) return fakeAgent(`seer-${seat}`, { script: "passive", prefer: [w1] });
      if (seat === doctor) return fakeAgent(`doc-${seat}`, { script: "passive", prefer: [a, b] });
      return fakeAgent(`vil-${seat}`, { script: "passive" });
    });
    const snap = await finished(await startMatch({ seed, agents }));
    const of = (kind: string) => snap.events.filter((e) => e.kind === kind);

    // Wolf Chat: two exchanges from both wolves on Night 1, visible to the wolves only.
    const chat1 = of("wolf_chat").filter((e) => e.data.cycle === 1);
    expect(chat1.map((e) => [e.data.exchange, e.data.seat, e.data.text])).toEqual([
      [1, w1, `w${w1} says hi`],
      [1, w2, `w${w2} says hi`],
      [2, w1, `w${w1} says hi`],
      [2, w2, `w${w2} says hi`],
    ]);
    for (const e of of("wolf_chat")) expect(e.audience).toEqual(wolves);

    // Pack Leader: every Night the wolves split, and the leader alternates while both live.
    const decided = of("kill_decided");
    expect(decided.length).toBeGreaterThanOrEqual(2);
    const [d1, d2] = decided;
    expect(d1!.data.packLeader).not.toBe(d2!.data.packLeader);
    for (const d of decided) {
      const proposals = of("kill_chosen").filter((k) => k.data.cycle === d.data.cycle);
      expect(proposals.find((k) => k.data.seat === d.data.packLeader)?.data.target).toBe(d.data.target);
      expect(d.audience).toEqual(wolves);
    }

    // Seer: privately learns w1 is a wolf.
    const seen = of("seer_result");
    expect(seen.length).toBeGreaterThan(0);
    for (const e of seen) expect(e).toMatchObject({ audience: [seer], data: { seat: seer, target: w1, side: "wolf" } });

    // Doctor: never the same player on consecutive Nights; a guarded kill target survives.
    const protects = of("protect_chosen").map((e) => e.data.target);
    for (let i = 1; i < protects.length; i++) expect(protects[i]).not.toBe(protects[i - 1]);
    const saves = of("doctor_saved");
    expect(saves.length).toBeGreaterThan(0);
    for (const s of saves) {
      expect(s.audience).toEqual([]);
      const nightDeaths = of("player_died").filter((d) => d.data.cause === "night_kill" && d.data.cycle === s.data.cycle);
      expect(nightDeaths).toEqual([]);
    }

    expect(snap.result?.winner).toMatch(/wolf|village/);
  });
});
