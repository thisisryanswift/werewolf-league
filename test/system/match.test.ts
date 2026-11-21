import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import { ADMIN, fakeAgent, finished, startMatch } from "./helpers";

/** Wolf seats the Ruleset deals for a 7-seat table with this seed. */
function wolvesFor(seed: string): number[] {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: "x", label: "x" }));
  const r = werewolf.setup({}, seed, seats);
  if (!r.ok) throw new Error(r.error);
  return r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
}

describe("a fake Match end to end", () => {
  it("rejects starting a Match without the admin secret", async () => {
    const res = await exports.default.fetch("http://test/api/admin/matches", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    const wrong = await exports.default.fetch("http://test/api/admin/matches", {
      method: "POST",
      headers: { "x-admin-secret": "nope" },
      body: "{}",
    });
    expect(wrong.status).toBe(401);
  });

  it("runs to a Village win when the village votes out both Werewolves", async () => {
    const seed = "village-wins";
    const wolves = wolvesFor(seed);
    // Villagers vote for the wolves in order; wolves never kill and abstain.
    const agents = Array.from({ length: 7 }, (_, i) =>
      wolves.includes(i + 1) ? fakeAgent(`wolf-${i + 1}`, { script: "passive" }) : fakeAgent(`vil-${i + 1}`, { prefer: wolves }),
    );
    const matchId = await startMatch({ seed, agents });
    const snap = await finished(matchId);

    expect(snap.result?.winner).toBe("village");
    const deaths = snap.events.filter((e) => e.kind === "player_died").map((e) => e.data);
    expect(deaths).toEqual([
      { seat: wolves[0], role: "werewolf", cause: "vote", cycle: 1 },
      { seat: wolves[1], role: "werewolf", cause: "vote", cycle: 2 },
    ]);
    expect(snap.events.at(-1)?.kind).toBe("match_over");
  });

  it("runs to a Werewolf win at parity when the wolves kill and vote out villagers", async () => {
    const seed = "wolves-win";
    const wolves = wolvesFor(seed);
    const villagers = [1, 2, 3, 4, 5, 6, 7].filter((s) => !wolves.includes(s));
    // Wolves target villagers in seat order; villagers abstain.
    const agents = Array.from({ length: 7 }, (_, i) =>
      wolves.includes(i + 1) ? fakeAgent(`wolf-${i + 1}`, { prefer: villagers }) : fakeAgent(`vil-${i + 1}`, { script: "passive" }),
    );
    const snap = await finished(await startMatch({ seed, agents }));
    expect(snap.result?.winner).toBe("wolf");
    expect(snap.events.find((e) => e.kind === "match_over")?.data.reason).toBe("parity");
    // 2 wolves v 5 villagers -> Night 1 kill, Day 1 vote-out, Night 2 kill -> 2 v 2.
    expect(snap.events.filter((e) => e.kind === "player_died").map((e) => e.data)).toEqual([
      { seat: villagers[0], role: "villager", cause: "night_kill", cycle: 1 },
      { seat: villagers[1], role: "villager", cause: "vote", cycle: 1 },
      { seat: villagers[2], role: "villager", cause: "night_kill", cycle: 2 },
    ]);
  });

  it("terminates via the 6-cycle cap when every Agent returns only defaults", async () => {
    // "no-call": every turn ends without a custom function call, so every action is the default.
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`p${i + 1}`, { script: "no-call" }));
    const matchId = await startMatch({ seed: "all-defaults", agents });
    const snap = await finished(matchId);
    expect(snap.result?.winner).toBe("wolf");
    expect(snap.events.find((e) => e.kind === "match_over")?.data.reason).toBe("cycle_cap");
    const ballots = snap.events.filter((e) => e.kind === "votes_revealed");
    expect(ballots).toHaveLength(6);
    for (const b of ballots) {
      for (const v of b.data.votes as { target: unknown; timedOut: boolean }[]) {
        expect(v).toMatchObject({ target: "abstain", timedOut: true });
      }
    }
    expect(snap.events.some((e) => e.kind === "player_died")).toBe(false);
  });

  it("gives committed events strictly increasing sequence numbers", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`s${i + 1}`));
    const snap = await finished(await startMatch({ seed: "seq", agents }));
    expect(snap.events.map((e) => e.seq)).toEqual(snap.events.map((_, i) => i + 1));
  });
});
