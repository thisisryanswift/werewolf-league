// Agent notes in the Match view (wl-rhpr): each seat's latest notes and when they were written.
import { describe, expect, it } from "vitest";
import type { MatchEvent, RulesetEvent } from "../../src/shared/protocol";
import { latestNotes } from "../../web/match/notes";

function logOf(events: RulesetEvent[]): MatchEvent[] {
  return events.map((e, i) => ({ ...e, seq: i + 1, ts: 1000 + i }));
}
const pub = (kind: string, data: Record<string, unknown>): RulesetEvent => ({ kind, audience: "all", data });
const notes = (seat: number, text: string): RulesetEvent => ({ kind: "notes_updated", audience: [], data: { seat, text, truncated: false } });

const LOG = logOf([
  pub("match_setup", { ruleset: "werewolf", seats: [1, 2].map((seat) => ({ seat, label: `A${seat} #1`, agentId: `a${seat}` })) }),
  pub("phase_started", { phase: "night", cycle: 1 }),
  notes(1, "first draft"),
  notes(2, "seat two"),
  pub("phase_started", { phase: "day", cycle: 1 }),
  notes(1, "P2 claimed Seer"),
]);

describe("Agent notes in the Match view", () => {
  it("shows each seat's latest notes and the Day or Night they were written", () => {
    const byseat = latestNotes(LOG, true);
    expect(byseat.get(1)).toMatchObject({ text: "P2 claimed Seer", when: "Day 1" });
    expect(byseat.get(2)).toMatchObject({ text: "seat two", when: "Night 1" });
  });

  it("hides notes when Narrator's View is off", () => {
    expect(latestNotes(LOG, false).size).toBe(0);
  });
});
