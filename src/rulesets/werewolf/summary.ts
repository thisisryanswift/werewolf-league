// Public tile summary for the League grid: phase, Day/Night number, living
// seats and the latest public speech line.

import type { MatchSummary } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { alive } from "./players";
import type { WerewolfState } from "./types";

const PHASE_NAME = { night: "Night", day: "Day", over: "Over" } as const;

/** Event kinds that carry a public speech line as `{ seat, text }`. */
const SPEECH_KINDS = new Set(["speech", "reply"]);

function latestSpeech(events: RulesetEvent[]): MatchSummary["latestSpeech"] {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.audience !== "all" || !SPEECH_KINDS.has(e.kind)) continue;
    const { seat, text } = e.data;
    if (typeof seat === "number" && typeof text === "string") return { seat, text };
  }
  return null;
}

export function summary(s: WerewolfState, publicEvents: RulesetEvent[]): MatchSummary {
  return {
    phase: PHASE_NAME[s.phase],
    round: s.cycle,
    alive: alive(s).map((p) => p.seat),
    latestSpeech: latestSpeech(publicEvents),
  };
}
