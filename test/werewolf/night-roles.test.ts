import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";
import { actors, dealt, inspect, kill, nightActions, protect, toNightAction, voteAll } from "./helpers";

const chat = (text: string) => ({ name: "wolf_chat", args: { text } });

/** A dealt table plus its plain Villager seats (not Seer or Doctor). */
function table(seed?: string) {
  const t = dealt(seed);
  return { ...t, plain: t.villagers.filter((s) => s !== t.seer && s !== t.doctor) };
}

const died = (events: { kind: string; data: Record<string, unknown> }[]) =>
  events.find((e) => e.kind === "player_died")?.data.seat ?? null;

/** Day with nobody eliminated, then the next Night. */
const quietDay = (s: WerewolfState) => voteAll(s, {}).state;

describe("Pack Leader", () => {
  it("decides a split, and the role passes to the other wolf each Night", () => {
    const { state, wolves, plain } = table();
    const [w1, w2] = wolves as [number, number];
    const [a, b] = plain as [number, number];
    const split = { [w1]: kill(a), [w2]: kill(b) };

    const n1 = nightActions(state, null, split);
    const leader1 = died(n1.events) === a ? w1 : w2;
    expect(died(n1.events)).toBe(leader1 === w1 ? a : b);
    expect(n1.events.find((e) => e.kind === "kill_decided")).toEqual({
      kind: "kill_decided",
      audience: wolves,
      data: { cycle: 1, packLeader: leader1, target: leader1 === w1 ? a : b },
    });

    // Night 2: the same split, now decided by the other wolf. Kill-free Night 1 keeps a and b alive.
    const n2 = nightActions(quietDay(nightActions(state, null).state), null, split);
    const leader2 = leader1 === w1 ? w2 : w1;
    expect(died(n2.events)).toBe(leader2 === w1 ? a : b);
    expect(n2.events.find((e) => e.kind === "kill_decided")?.data.packLeader).toBe(leader2);
  });

  it("names tonight's Pack Leader in both wolves' prompts", () => {
    const { state, wolves, plain } = table();
    const leader = (() => {
      const r = nightActions(state, null, { [wolves[0]!]: kill(plain[0]!), [wolves[1]!]: kill(plain[1]!) });
      return r.events.find((e) => e.kind === "kill_decided")!.data.packLeader;
    })();
    const step = werewolf.nextStep(state);
    if (step.type !== "turns") throw new Error();
    for (const t of step.turns) expect(t.prompt).toContain(`Name${leader} (seat ${leader}):`);
  });

  it("when only the non-leader wolf submits a kill, that target dies", () => {
    const { state, wolves, plain } = table();
    const leader = nightActions(state, null, { [wolves[0]!]: kill(plain[0]!), [wolves[1]!]: kill(plain[1]!) }).events.find(
      (e) => e.kind === "kill_decided",
    )!.data.packLeader;
    const follower = wolves.find((w) => w !== leader)!;
    const r = nightActions(state, null, { [leader as number]: null, [follower]: kill(plain[2]!) });
    expect(died(r.events)).toBe(plain[2]);
  });
});

describe("Seer", () => {
  it("privately learns the inspected player's Side", () => {
    const { state, wolves, plain, seer } = table();
    const asWolf = nightActions(state, null, { [seer]: inspect(wolves[1]!) });
    expect(asWolf.events.find((e) => e.kind === "seer_result")).toEqual({
      kind: "seer_result",
      audience: [seer],
      data: { cycle: 1, seat: seer, target: wolves[1], side: "wolf" },
    });
    const asVillage = nightActions(state, null, { [seer]: inspect(plain[0]!) });
    expect(asVillage.events.find((e) => e.kind === "seer_result")?.data.side).toBe("village");
  });

  it("acts alongside the wolves' kill, and may inspect any other living player", () => {
    const { state, seer, doctor, wolves } = table();
    const at = toNightAction(state);
    expect(actors(at)).toEqual([...wolves, seer, doctor].sort((a, b) => a - b));
    expect(werewolf.validate(at, seer, inspect(seer))).toEqual({ ok: false, error: expect.stringContaining("Required action: inspect") });
    expect(werewolf.validate(at, seer, inspect(wolves[0]!)).ok).toBe(true);
    expect(werewolf.validate(at, seer, kill(wolves[0]!))).toEqual({ ok: false, error: expect.stringContaining("Required action: inspect") });
  });
});

describe("Doctor", () => {
  it("saves the wolves' target: nobody dies, and only God View sees the save", () => {
    const { state, plain, doctor } = table();
    const r = nightActions(state, plain[0]!, { [doctor]: protect(plain[0]!) });
    expect(died(r.events)).toBeNull();
    expect(r.events.find((e) => e.kind === "night_passed")?.data).toEqual({ cycle: 1, killed: null });
    expect(r.events.find((e) => e.kind === "protect_chosen")).toEqual({
      kind: "protect_chosen",
      audience: [doctor],
      data: { cycle: 1, seat: doctor, target: plain[0] },
    });
    const save = r.events.find((e) => e.kind === "doctor_saved")!;
    expect(save.data).toEqual({ cycle: 1, seat: doctor, target: plain[0] });
    expect(werewolf.view([save], { spectator: true, godView: true })).toHaveLength(1);
    for (let seat = 1; seat <= 7; seat++) expect(werewolf.view([save], { seat })).toHaveLength(0);
  });

  it("protecting someone else does not stop the kill; self-protection is allowed", () => {
    const { state, plain, doctor } = table();
    expect(died(nightActions(state, plain[0]!, { [doctor]: protect(plain[1]!) }).events)).toBe(plain[0]);
    expect(died(nightActions(state, doctor, { [doctor]: protect(doctor) }).events)).toBeNull();
  });

  it("rejects protecting the same player on consecutive Nights, naming the rule", () => {
    const { state, plain, doctor } = table();
    const night2 = quietDay(nightActions(state, null, { [doctor]: protect(plain[0]!) }).state);
    const at = toNightAction(night2);
    const v = werewolf.validate(at, doctor, protect(plain[0]!));
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.error).toMatch(/same player on consecutive Nights/);
    expect(v.error).toContain("Required action: protect");
    expect(werewolf.validate(at, doctor, protect(plain[1]!)).ok).toBe(true);
    // A Night without protection resets the rule.
    const night3 = toNightAction(quietDay(nightActions(night2, null).state));
    expect(werewolf.validate(night3, doctor, protect(plain[0]!)).ok).toBe(true);
  });
});

describe("Night privacy", () => {
  it("keeps Wolf Chat and Seer results out of village Players' observations", () => {
    const { state, wolves, seer, doctor, plain } = table();
    const log: { kind: string; audience: "all" | number[]; data: Record<string, unknown> }[] = [];
    let s = state;
    for (const text of ["secret plan", "agreed"]) {
      const r = werewolf.applyActions(s, Object.fromEntries(wolves.map((w) => [w, chat(text)])));
      log.push(...r.events);
      s = r.state;
    }
    const r = nightActions(s, plain[0]!, { [seer]: inspect(wolves[0]!) });
    log.push(...r.events);
    const day = werewolf.nextStep(r.state);
    if (day.type !== "turns") throw new Error();
    const observe = (seat: number) =>
      werewolf.renderObservation(r.state, seat, werewolf.view(log, { seat }), day.turns.find((t) => t.seat === seat)!);

    for (const seat of [doctor, plain[1]!]) {
      const text = observe(seat);
      expect(text).not.toContain("secret plan");
      expect(text).not.toMatch(/Wolf Chat|inspect/i);
      expect(text).toContain("was killed in the Night");
    }
    expect(observe(seer)).toContain(`Name${wolves[0]} (seat ${wolves[0]}) is on the wolf side`);
    expect(observe(seer)).toMatch(/wolf side/);
    expect(observe(wolves[1]!)).toContain("secret plan");
    expect(observe(wolves[1]!)).not.toMatch(/wolf side/);
  });
});

describe("Wolf Chat", () => {
  it("opens each Night with two Wolf Chat exchanges, visible only to the wolves", () => {
    const { state, wolves } = dealt();
    const step = werewolf.nextStep(state);
    if (step.type !== "turns") throw new Error();
    expect(step.turns.map((t) => [t.seat, t.actionKind])).toEqual(wolves.map((w) => [w, "wolf_chat"]));

    const r1 = werewolf.applyActions(state, { [wolves[0]!]: chat("kill 3?"), [wolves[1]!]: chat("ok") });
    expect(r1.events).toEqual([
      { kind: "wolf_chat", audience: wolves, data: { cycle: 1, exchange: 1, seat: wolves[0], text: "kill 3?" } },
      { kind: "wolf_chat", audience: wolves, data: { cycle: 1, exchange: 1, seat: wolves[1], text: "ok" } },
    ]);
    expect(actors(r1.state)).toEqual(wolves);
    const r2 = werewolf.applyActions(r1.state, { [wolves[0]!]: null, [wolves[1]!]: chat("agreed") });
    expect(r2.events).toEqual([
      { kind: "wolf_chat", audience: wolves, data: { cycle: 1, exchange: 2, seat: wolves[1], text: "agreed" } },
    ]);
    const next = werewolf.nextStep(r2.state);
    if (next.type !== "turns") throw new Error();
    expect(next.turns.filter((t) => wolves.includes(t.seat)).map((t) => t.actionKind)).toEqual(["choose_kill", "choose_kill"]);
  });

  it("rejects a Wolf Chat call without text, naming the required action", () => {
    const { state, wolves } = dealt();
    expect(werewolf.validate(state, wolves[0]!, { name: "wolf_chat", args: {} })).toEqual({
      ok: false,
      error: expect.stringContaining("Required action: wolf_chat"),
    });
    expect(werewolf.validate(state, wolves[0]!, { name: "choose_kill", args: { target: 1 } })).toEqual({
      ok: false,
      error: expect.stringContaining("Required action: wolf_chat"),
    });
    expect(werewolf.validate(state, wolves[0]!, chat("hi")).ok).toBe(true);
  });
});
