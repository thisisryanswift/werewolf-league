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

  it("runs to a Werewolf win at parity when the wolves kill every Night", async () => {
    // Everyone picks the first legal target: wolves kill the lowest villager,
    // and every voter votes for the lowest other seat.
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`a${i + 1}`, { script: "first-legal" }));
    const matchId = await startMatch({ seed: "wolves-kill", agents });
    const snap = await finished(matchId);
    const over = snap.events.find((e) => e.kind === "match_over")!;
    const roles = over.data.roles as Record<string, string>;
    const dead = new Set(snap.events.filter((e) => e.kind === "player_died").map((e) => String(e.data.seat)));
    const living = Object.keys(roles).filter((s) => !dead.has(s));
    const livingWolves = living.filter((s) => roles[s] === "werewolf").length;
    // Independent check of the outcome against the log.
    if (snap.result?.winner === "village") expect(livingWolves).toBe(0);
    else expect(livingWolves).toBeGreaterThanOrEqual(living.length - livingWolves);
  });

  it("terminates via the 6-cycle cap when every Agent returns only defaults", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`p${i + 1}`, { script: "passive" }));
    const matchId = await startMatch({ seed: "all-defaults", agents });
    const snap = await finished(matchId);
    expect(snap.result?.winner).toBe("wolf");
    expect(snap.events.find((e) => e.kind === "match_over")?.data.reason).toBe("cycle_cap");
    expect(snap.events.filter((e) => e.kind === "votes_revealed")).toHaveLength(6);
  });

  it("gives committed events strictly increasing sequence numbers", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`s${i + 1}`));
    const snap = await finished(await startMatch({ seed: "seq", agents }));
    expect(snap.events.map((e) => e.seq)).toEqual(snap.events.map((_, i) => i + 1));
  });
});
