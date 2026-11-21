// What the post-Match Analyst (wl-ofdn) reads about a Werewolf Match: its Agent
// Instructions (docs/agent-instructions/analyst.md, the `analyst` section) and the
// input text: the Narrator's View log (the Narrator's renderer, plus beliefs), the
// seats with their final roles, the result and per-Player stats.

import source from "../../../docs/agent-instructions/analyst.md";
import type { AnalysisStats, Seat } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";
import { narrationLog } from "./narration";
import { ROLE_NAMES } from "./night";
import { who } from "./players";
import { SIDE_OF, type WerewolfState } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Beliefs are recorded normalized (summing to the Werewolves among the voter's others); raw beliefs aren't logged. */
const ANALYSIS_TEXT = {
  beliefs_recorded: (d: Record<string, unknown>, s: WerewolfState) =>
    (d.ballots as { seat: Seat; beliefs: Record<string, number> }[])
      .map(
        (b) =>
          `Day ${d.cycle} beliefs (normalized) of ${who(s, b.seat)}: ` +
          Object.entries(b.beliefs)
            .map(([seat, p]) => `seat ${seat} ${round2(p)}`)
            .join(", "),
      )
      .join("\n") || null,
};

const REASONS: Record<string, string> = {
  all_werewolves_dead: "every Werewolf is dead",
  parity: "the Werewolves reached parity",
  cycle_cap: "Werewolves survived the last Night",
};

export function analysisInput(s: WerewolfState, events: RulesetEvent[], stats: AnalysisStats): string {
  const over = events.find((e) => e.kind === "match_over");
  const count = (seat: Seat, kind: string, pick: (d: Record<string, unknown>) => boolean = () => true) =>
    events.filter((e) => e.kind === kind && Number(e.data.seat) === seat && pick(e.data)).length;
  const votes = (seat: Seat) =>
    events
      .filter((e) => e.kind === "votes_revealed")
      .flatMap((e) => e.data.votes as { seat: Seat; timedOut: boolean }[])
      .filter((v) => v.seat === seat && !v.timedOut).length;
  const seats = s.players.map(
    (p) =>
      `Seat ${p.seat}: ${p.displayName} (${p.label}), ${ROLE_NAMES[p.role]}, ${SIDE_OF[p.role] === "wolf" ? "Werewolf side" : "Village side"}, ` +
      `${p.alive ? "alive at the end" : "dead"}; speeches ${count(p.seat, "speech", (d) => !d.skipped)}, ` +
      `skipped speeches ${count(p.seat, "speech", (d) => !!d.skipped)}, votes cast ${votes(p.seat)}, timeouts ${stats.timeouts[p.seat] ?? 0}`,
  );
  const winner = s.winner === "wolf" ? "the Werewolves" : s.winner === "village" ? "the Village" : "nobody yet";
  const reason = over ? (REASONS[String(over.data.reason)] ?? String(over.data.reason)) : "";
  return [
    `Result: ${winner} won${reason ? ` (${reason})` : ""}.`,
    "",
    "Seats (Display Name, Agent, final role, Side, fate; per-Player stats):",
    ...seats,
    "",
    narrationLog(s, events, ANALYSIS_TEXT),
  ].join("\n");
}

export const analysis = {
  instructions: { source, sections: ["analyst"] },
  input: analysisInput,
};
