import { describe, expect, it } from "vitest";
import { assembleInstructions } from "../../src/core/agent-instructions";
import { werewolf } from "../../src/rulesets/werewolf";
import type { RulesetEvent } from "../../src/shared/protocol";
import { act, actors, day1Vote, dealt, nightActions, speakUntilVote, vote } from "./helpers";

describe("Werewolf analysis input", () => {
  it("gives the Analyst the Narrator's View log plus seats, beliefs, the result and per-Player stats", () => {
    const t = dealt("analysis");
    const events: RulesetEvent[] = [];
    const chat = act(t.state, (seat) => ({ name: "wolf_chat", args: { text: `seat ${seat} wants a quiet Night` } }));
    events.push(...chat.events);
    const villager = t.villagers.find((v) => v !== t.seer && v !== t.doctor)!;
    const night = nightActions(chat.state, villager, { [t.seer]: { name: "inspect", args: { target: t.wolves[0] } } });
    events.push(...night.events);
    const target = t.wolves[0]!;
    const atVote = speakUntilVote(night.state).state;
    const day = werewolf.applyActions(
      atVote,
      Object.fromEntries(actors(atVote).map((s) => [s, s === t.seer ? vote(target, { [target]: 1 }) : vote("abstain")])),
    );
    events.push(...day.events);

    const text = werewolf.analysis!.input(day.state, events, { timeouts: { [t.seer]: 2 } });
    // The same Narrator's View log the Narrator reads.
    expect(text).toContain(werewolf.narration!.log(day.state, events).split("\n").slice(3, 6).join("\n"));
    expect(text).toContain(`Wolf Chat (Night 1) — Name${t.wolves[0]} (seat ${t.wolves[0]}): seat ${t.wolves[0]} wants a quiet Night`);
    // Seats with Display Name, Agent and role, so mistakes can name both.
    expect(text).toContain(`Seat ${t.seer}: Name${t.seer} (Agent ${t.seer}), Seer`);
    // Beliefs are in the log, labelled as normalized.
    expect(text).toMatch(new RegExp(`Day 1 beliefs \\(normalized\\) of Name${t.seer} \\(seat ${t.seer}\\): .*seat ${target} 1`));
    // Per-Player stats: timeouts.
    expect(text).toMatch(new RegExp(`Seat ${t.seer}: .*timeouts 2`));
    expect(text).toMatch(new RegExp(`Seat ${villager}: .*timeouts 0`));
  });

  it("does not change what the Narrator reads", () => {
    const t = day1Vote("analysis-narrator");
    const r = act(t.state, () => vote("abstain"));
    expect(r.events.some((e) => e.kind === "beliefs_recorded")).toBe(true);
    const log = werewolf.narration!.log(r.state, r.events);
    expect(log).not.toContain("beliefs");
  });

  it("mounts the analyst section of the Analyst Instructions and nothing above it", () => {
    const a = werewolf.analysis!.instructions;
    const text = assembleInstructions(a.source, a.sections);
    expect(text.startsWith("# How to analyse a Werewolf Match")).toBe(true);
    expect(text).toContain("submit_report");
    expect(text).not.toContain("Wiring (for the orchestrator");
  });
});
