// Display Names end to end: a whole Match on the managed-agent harness (stubbed
// Interactions API, real Match/Player DOs and alarms). Every text actually sent to
// any Player is scanned for roster Agent names, ids, model ids and copy labels.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { API_BASE } from "../../src/harness/managed-agent/api";
import { StubInteractionsApi } from "../harness/stub-interactions-api";
import { fakeAgent, finished, snapshot, startMatch } from "./helpers";
import { expectNoAgentIdentity, mountedInstructions, playerTexts } from "./player-text";

const REQUIRED = /Required action: (\w+) with target one of ([^.]+)\./;

/** Opening move: an out-of-phase speech (so error results are sent too), then whatever the error asks for. */
function autoAgent(api: StubInteractionsApi): void {
  for (const it of api.interactions.values()) {
    if (it.status !== "in_progress") continue;
    if (typeof it.body.input === "string" && it.body.input.includes("Setup only")) continue;
    const text = JSON.stringify(it.body.input);
    const m = REQUIRED.exec(text);
    if (!m) {
      if (text.includes('"accepted":false')) {
        api.complete(it.id);
        continue;
      }
      const ask = text.slice(text.lastIndexOf("Your turn:"));
      const other = Number(/seats from (\d+)/.exec(ask)?.[1]);
      if (other) api.callTool(it.id, "speak", { text: "Hello.", accuse: [other], claim: { role: "seer", results: [{ seat: other, side: "wolf" }] } });
      else if (ask.includes("with wolf_chat")) api.callTool(it.id, "wolf_chat", { text: "Let us hunt." });
      else api.callTool(it.id, "speak", { text: "I speak out of turn." });
      continue;
    }
    const first = m[2]!.split(",")[0]!.trim();
    api.callTool(it.id, m[1]!, { target: first === "abstain" ? "abstain" : Number(first), beliefs: {}, reason: "stub" });
  }
}

const agent = (id: string, name: string, model: string): AgentConfig => ({
  id,
  name,
  harness: "managed-agent",
  model,
  // No instructions of its own: every seat gets the Ruleset's default Agent Instructions mounted.
});

// Copies of the same Agent share the table, so copy labels like "Hydrogen #2" exist.
const hydrogen = agent("roster-hydrogen", "Hydrogen", "gemini-4-hydrogen");
const flash = agent("roster-flash-38", "3.8 Flash", "gemini-3.8-flash");
const lite = agent("roster-flash-lite-35", "3.5 Flash-Lite", "gemini-3.5-flash-lite");
const agents = [hydrogen, flash, hydrogen, lite, flash, hydrogen, lite];

afterEach(() => vi.restoreAllMocks());

describe("Display Names through a whole Match", () => {
  it("the spectator log carries each seat's Display Name with its Agent and copy label", async () => {
    const fake = [fakeAgent("a"), fakeAgent("a"), fakeAgent("b"), fakeAgent("b"), fakeAgent("c"), fakeAgent("c"), fakeAgent("c")];
    const matchId = await startMatch({ seed: "display-names-log", agents: fake });
    const snap = (await finished(matchId)) as unknown as Awaited<ReturnType<typeof finished>> & { seats: object[] };
    const setup = snap.events.find((e) => e.kind === "match_setup")!.data.seats as Record<string, unknown>[];
    expect(setup).toEqual(snap.seats.map((s) => expect.objectContaining(s)));
    expect(setup[1]).toMatchObject({ seat: 2, agentId: "a", label: "a #2", displayName: expect.stringMatching(/^[A-Z][a-z]+$/) });
  });

  it("no text sent to any Player contains a roster Agent name, id, model id or copy label", async () => {
    const api = new StubInteractionsApi();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(API_BASE)) return realFetch(input, init);
      const res = await api.fetch(input, init);
      autoAgent(api);
      return res;
    });

    const matchId = await startMatch({ seed: "display-names-e2e", agents });
    const snap = await finished(matchId);
    const seats = ((await snapshot(matchId)) as unknown as { seats: { label: string; displayName: string }[] }).seats;
    expect(seats.map((s) => s.label)).toContain("Hydrogen #2");

    const texts = playerTexts(api);
    expectNoAgentIdentity(texts, agents, seats.map((s) => s.label));

    // The scan saw real game text: every seat's briefing, Wolf Chat, speeches, votes and error results.
    const all = texts.join("\n");
    const briefings = texts.filter((t) => t.includes("Your secret role"));
    expect(briefings.length).toBeGreaterThanOrEqual(7);
    for (const s of seats) expect(all).toContain(`- Seat ${seats.indexOf(s) + 1}: ${s.displayName}`);
    expect(all).toContain("Wolf Chat (Night 1)");
    expect(all).toMatch(/votes: /);
    expect(all).toMatch(/is not allowed now/);
    // The scan covered every seat's mounted AGENTS.md (from the provision requests).
    const mounted = mountedInstructions(api);
    expect(mounted.length).toBeGreaterThanOrEqual(7);
    expect(mounted.every((m) => m.length > 100)).toBe(true);
    expect(snap.events.some((e) => e.kind === "speech" && !e.data.skipped)).toBe(true);
  });
});
