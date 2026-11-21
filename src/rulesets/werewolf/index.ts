// The Werewolf Ruleset entry. Phase logic lives in night.ts / day.ts, the deal
// in deal.ts, win conditions in win.ts; this file only wires them together.

import { viewByAudience, type Ruleset, type Seat, type ToolCall } from "../../core/ruleset";
import { setup } from "./deal";
import { day } from "./day";
import { night } from "./night";
import { instructions } from "./instructions";
import { briefing, renderObservation } from "./text";
import type { PhaseModule, Side, WerewolfState } from "./types";
import { summary } from "./summary";
import { resultOf, settle } from "./win";

const PHASES: Record<"night" | "day", PhaseModule> = { night, day };

function phaseOf(s: WerewolfState): PhaseModule | null {
  return s.phase === "over" ? null : PHASES[s.phase];
}

export const werewolf: Ruleset<WerewolfState> = {
  id: "werewolf",
  sides: ["wolf", "village"] satisfies Side[],
  setup,
  nextStep(s) {
    const result = this.result(s);
    if (result) return { type: "finished", result };
    return { type: "turns", turns: phaseOf(s)!.turns(s) };
  },
  validate(s, seat, call) {
    const phase = phaseOf(s);
    if (!phase) return { ok: false, error: "The Match is over." };
    return phase.validate(s, seat, call);
  },
  applyActions(s, actions: Record<Seat, ToolCall | null>) {
    const phase = phaseOf(s);
    if (!phase) return { state: s, events: [] };
    const r = phase.apply(s, actions);
    return settle(r.state, r.events);
  },
  view: viewByAudience,
  instructions,
  briefing,
  renderObservation,
  result: resultOf,
  summary,
};
