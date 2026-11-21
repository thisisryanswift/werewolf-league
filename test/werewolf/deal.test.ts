import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { seatsOf } from "./helpers";

function setupOk(seed: string, n = 7) {
  const r = werewolf.setup({}, seed, seatsOf(n));
  if (!r.ok) throw new Error(r.error);
  return r;
}

const rolesOf = (r: { events: { kind: string; data: Record<string, unknown> }[] }) =>
  Object.fromEntries(r.events.filter((e) => e.kind === "role_assigned").map((e) => [e.data.seat, e.data.role]));

const count = (roles: Record<string, unknown>) => {
  const out: Record<string, number> = {};
  for (const r of Object.values(roles)) out[r as string] = (out[r as string] ?? 0) + 1;
  return out;
};

describe("Werewolf deal", () => {
  it("deals 2 Werewolves, a Seer, a Doctor and Villagers for the rest, the same way for the same seed", () => {
    const a = setupOk("seed-1");
    expect(werewolf.result(a.state)).toBeNull();
    expect(count(rolesOf(a))).toEqual({ werewolf: 2, seer: 1, doctor: 1, villager: 3 });
    expect(count(rolesOf(setupOk("seed-1", 8)))).toEqual({ werewolf: 2, seer: 1, doctor: 1, villager: 4 });
    expect(rolesOf(setupOk("seed-1"))).toEqual(rolesOf(a));
  });

  it("varies the deal with the seed", () => {
    const deals = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(rolesOf(setupOk(`vary-${i}`)))));
    expect(deals.size).toBeGreaterThan(10);
  });

  it("gives every seat speak and vote, plus its role's fixed night tools", () => {
    const r = setupOk("seed-2");
    const roles = rolesOf(r);
    const expected: Record<string, string[]> = {
      werewolf: ["choose_kill", "speak", "vote", "wolf_chat"],
      seer: ["inspect", "speak", "vote"],
      doctor: ["protect", "speak", "vote"],
      villager: ["speak", "vote"],
    };
    for (let seat = 1; seat <= 7; seat++) {
      expect(r.tools[seat]!.map((t) => t.name).sort()).toEqual(expected[roles[seat] as string]);
    }
  });

  it("tells each Player its role privately and wolves their partner", () => {
    const r = setupOk("seed-3");
    for (const e of r.events.filter((e) => e.kind === "role_assigned")) {
      expect(e.audience).toEqual([e.data.seat]);
    }
    const team = r.events.find((e) => e.kind === "wolf_team")!;
    expect(team.audience).toEqual(team.data.wolves);
  });

  it("never gives both Werewolf seats to the same Agent", () => {
    // Two Agents only: seats 1-6 are copies of A, seat 7 is B. Every deal must use B as a wolf.
    const seats = seatsOf(7).map((s) =>
      s.seat === 7 ? { ...s, agentId: "B", label: "B" } : { ...s, agentId: "A", label: `A #${s.seat}` },
    );
    for (let i = 0; i < 200; i++) {
      const r = werewolf.setup({}, `mirror-${i}`, seats);
      if (!r.ok) throw new Error(r.error);
      const wolves = r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
      expect(wolves).toHaveLength(2);
      expect(wolves).toContain(7);
    }
  });

  it("deals the same seats for the same seed when Agents repeat", () => {
    const seats = seatsOf(7).map((s) => ({ ...s, agentId: `agent-${s.seat % 3}` }));
    const wolvesOf = (seed: string) => {
      const r = werewolf.setup({}, seed, seats);
      if (!r.ok) throw new Error(r.error);
      return r.events.find((e) => e.kind === "wolf_team")!.data.wolves;
    };
    expect(wolvesOf("repeat")).toEqual(wolvesOf("repeat"));
  });

  it("refuses to deal when every seat is the same Agent", () => {
    const seats = seatsOf(7).map((s) => ({ ...s, agentId: "solo" }));
    const r = werewolf.setup({}, "solo", seats);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("different Agents") });
  });

  it("starts with Night 1", () => {
    const r = setupOk("seed-4");
    const step = werewolf.nextStep(r.state);
    expect(step.type).toBe("turns");
    if (step.type !== "turns") return;
    expect(step.turns.map((t) => t.actionKind)).toEqual(["wolf_chat", "wolf_chat"]);
  });
});
