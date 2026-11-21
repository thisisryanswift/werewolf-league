// Agent Instructions (wl-cizy): the Ruleset names each seat's sections, the Match
// assembles them and hands the text to the Harness at provisioning. The Fake Harness
// records what it was given in its chain, which we read from each Player DO.

import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import doc from "../../docs/agent-instructions/werewolf.md";
import { werewolf } from "../../src/rulesets/werewolf";
import { fakeAgent, finished, startMatch } from "./helpers";

// Each section's heading, as written in docs/agent-instructions/werewolf.md.
const HEADING = {
  shared: "# How to play this Werewolf Match",
  village: "# Your Side: the Village",
  seer: "# Your role: Seer",
  doctor: "# Your role: Doctor",
  werewolf: "# Your Side: the Werewolves",
} as const;
type Key = keyof typeof HEADING;

const EXPECTED: Record<string, Key[]> = {
  villager: ["shared", "village"],
  seer: ["shared", "village", "seer"],
  doctor: ["shared", "village", "doctor"],
  werewolf: ["shared", "werewolf"],
};

function rolesFor(seed: string): Record<number, string> {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `x${i}`, label: "x" }));
  const r = werewolf.setup({}, seed, seats);
  if (!r.ok) throw new Error(r.error);
  return Object.fromEntries(r.state.players.map((p) => [p.seat, p.role]));
}

async function mounted(matchId: string, seat: number): Promise<string | undefined> {
  return runInDurableObject(env.PLAYER.getByName(`${matchId}:${seat}`), async (_i, state) => {
    const chain = state.storage.kv.get<Record<string, unknown>>("chain");
    return chain?.instructions as string | undefined;
  });
}

/** The section keys present in `text`, in the order they appear. */
function sectionsIn(text: string): Key[] {
  return (Object.keys(HEADING) as Key[])
    .filter((k) => text.includes(HEADING[k]))
    .sort((a, b) => text.indexOf(HEADING[a]) - text.indexOf(HEADING[b]));
}

function expectSeatInstructions(text: string | undefined, role: string) {
  expect(text, role).toBeDefined();
  expect(sectionsIn(text!), role).toEqual(EXPECTED[role]);
  expect(text!.startsWith(HEADING.shared), role).toBe(true);
  // The text above the first marker is for humans and is never mounted; nor are the markers.
  expect(text).not.toContain("Wiring (for the harness");
  expect(text).not.toContain("<!-- section");
}

describe("Agent Instructions at provisioning", () => {
  it("gives each seat exactly its Ruleset-named sections, in order, and never another role's", async () => {
    const seed = "instructions-1";
    const roles = rolesFor(seed);
    expect(new Set(Object.values(roles))).toEqual(new Set(["villager", "seer", "doctor", "werewolf"]));
    const agents = Array.from({ length: 7 }, (_, i) => fakeAgent(`a${i + 1}`));
    const matchId = await startMatch({ seed, agents });
    for (let seat = 1; seat <= 7; seat++) expectSeatInstructions(await mounted(matchId, seat), roles[seat]!);
    await finished(matchId);
  });

  it("selects the seat's sections from an Agent's own sectioned instructions (whole file from the first marker)", async () => {
    const seed = "instructions-2";
    const roles = rolesFor(seed);
    const sectioned = doc.slice(doc.indexOf("<!-- section:"));
    const agents = Array.from({ length: 7 }, (_, i) => ({ ...fakeAgent(`b${i + 1}`), instructions: sectioned }));
    const matchId = await startMatch({ seed, agents });
    for (let seat = 1; seat <= 7; seat++) expectSeatInstructions(await mounted(matchId, seat), roles[seat]!);
    await finished(matchId);
  });

  it("mounts an Agent's unsectioned instructions as they are", async () => {
    const agents = Array.from({ length: 7 }, (_, i) => ({ ...fakeAgent(`c${i + 1}`), instructions: "Trust nobody." }));
    const matchId = await startMatch({ seed: "instructions-3", agents });
    for (let seat = 1; seat <= 7; seat++) expect(await mounted(matchId, seat)).toBe("Trust nobody.");
    await finished(matchId);
  });

  it("refuses to start when an Agent's sectioned instructions lack a section the Ruleset names", async () => {
    const noWolf = doc.slice(doc.indexOf("<!-- section:"), doc.indexOf("<!-- section: werewolf -->"));
    const agents = Array.from({ length: 7 }, (_, i) => ({ ...fakeAgent(`d${i + 1}`), instructions: noWolf }));
    await expect(startMatch({ seed: "instructions-4", agents })).rejects.toThrow(/werewolf/);
  });
});
