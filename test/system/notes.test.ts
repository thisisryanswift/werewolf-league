// Agent notes in Narrator's View (wl-rhpr): each seat's /notes.md scratchpad is published
// as a Narrator's-View-only notes_updated event when it changes, and never reaches a
// Player, the Narrator or the Match's result.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../../src/core/harness";
import { API_BASE } from "../../src/harness/managed-agent/api";
import type { MatchEvent } from "../../src/shared/protocol";
import { StubInteractionsApi } from "../harness/stub-interactions-api";
import { fakeAgent, finished, startMatch } from "./helpers";
import { playerTexts } from "./player-text";

const notesEvents = (events: MatchEvent[], seat?: number) =>
  events.filter((e) => e.kind === "notes_updated" && (seat === undefined || e.data.seat === seat));

afterEach(() => vi.restoreAllMocks());

describe("Agent notes (Fake Harness)", () => {
  it("publishes one notes_updated per change and none when the notes are unchanged", async () => {
    // Seat 1 rewrites its notes on turns 1 and 3, repeats them on turn 2, then stops writing.
    const agents = [
      fakeAgent("noter", { notes: ["Night 1: nothing yet.", "Night 1: nothing yet.", "P3 claimed Seer."] }),
      ...Array.from({ length: 6 }, (_, i) => fakeAgent(`plain-${i + 2}`)),
    ];
    const snap = await finished(await startMatch({ seed: "notes-fake", agents }));
    const mine = notesEvents(snap.events, 1);
    expect(mine.map((e) => e.data.text)).toEqual(["Night 1: nothing yet.", "P3 claimed Seer."]);
    // Narrator's-View-only: addressed to nobody, so no Player's view includes it.
    expect(mine.every((e) => Array.isArray(e.audience) && e.audience.length === 0)).toBe(true);
    expect(notesEvents(snap.events).length).toBe(2);
  });

  it("truncates long notes to about 2 KB", async () => {
    const long = "x".repeat(5000);
    const agents = [fakeAgent("noter", { notes: [long] }), ...Array.from({ length: 6 }, (_, i) => fakeAgent(`plain-${i + 2}`))];
    const snap = await finished(await startMatch({ seed: "notes-long", agents }));
    const [e] = notesEvents(snap.events, 1);
    expect(String(e!.data.text).length).toBeLessThanOrEqual(2048);
    expect(e!.data.truncated).toBe(true);
  });

  it("a capture failure (unreadable notes) doesn't fail the turn: the action still counts", async () => {
    // The seat answers every turn with a legal call while its notes are garbage.
    const agents = [fakeAgent("broken", { notes: [42, { not: "text" }, null] }), ...Array.from({ length: 6 }, (_, i) => fakeAgent(`plain-${i + 2}`))];
    const snap = await finished(await startMatch({ seed: "notes-broken", agents }));
    expect(notesEvents(snap.events)).toEqual([]);
    expect(snap.stats.timeouts.bySeat[1]).toBe(0);
    expect(["wolf", "village"]).toContain(snap.result?.winner);
  });
});

describe("Agent notes (managed-agent harness, stubbed API)", () => {
  const REQUIRED = /Required action: (\w+) with target one of ([^.]+)\./;

  /** Like the managed-agent system test's Agent, but every turn first rewrites /notes.md. */
  function notingAgent(api: StubInteractionsApi, turns: Map<string, number>): void {
    for (const it of api.interactions.values()) {
      if (it.status !== "in_progress") continue;
      if (typeof it.body.input === "string" && it.body.input.includes("Setup only")) continue;
      const env = String(it.body.environment);
      const n = (turns.get(env) ?? 0) + 1;
      turns.set(env, n);
      const fs = `fs_${it.id}`;
      it.steps.push(
        { type: "function_call", id: fs, name: "write_to_file", arguments: { TargetFile: "/notes.md", CodeContent: `SECRET-NOTE ${env} #${n}`, Overwrite: true } },
        { type: "function_result", call_id: fs, result: "ok" },
      );
      const m = REQUIRED.exec(JSON.stringify(it.body.input));
      if (!m) {
        api.complete(it.id);
        continue;
      }
      const first = m[2]!.split(",")[0]!.trim();
      api.callTool(it.id, m[1]!, { target: first === "abstain" ? "abstain" : Number(first), beliefs: {}, reason: "stub" });
    }
  }

  it("publishes notes from write_to_file steps and never shows them to any Player", async () => {
    const api = new StubInteractionsApi();
    const turns = new Map<string, number>();
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(API_BASE)) return realFetch(input, init);
      const res = await api.fetch(input, init);
      notingAgent(api, turns);
      return res;
    });
    const agents: AgentConfig[] = Array.from({ length: 7 }, (_, i) => ({
      id: `ma-${i + 1}`,
      name: `MA ${i + 1}`,
      harness: "managed-agent",
      model: "gemini-4-hydrogen",
      instructions: "Stub instructions.",
    }));
    const snap = await finished(await startMatch({ seed: "notes-managed", agents }));
    expect(notesEvents(snap.events).length).toBeGreaterThan(0);
    expect(notesEvents(snap.events).every((e) => String(e.data.text).startsWith("SECRET-NOTE"))).toBe(true);
    // No observation, error or retry text any Agent was sent carries anyone's notes.
    for (const text of playerTexts(api)) expect(text).not.toContain("SECRET-NOTE");
  });
});
