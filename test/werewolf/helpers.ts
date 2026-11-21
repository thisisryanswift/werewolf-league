import type { SeatAgent, ToolCall } from "../../src/core/ruleset";
import { werewolf } from "../../src/rulesets/werewolf";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";

export function seatsOf(n: number): SeatAgent[] {
  return Array.from({ length: n }, (_, i) => ({ seat: i + 1, agentId: `agent-${i + 1}`, label: `Agent ${i + 1}` }));
}

export const kill = (target: number): ToolCall => ({ name: "choose_kill", args: { target } });
export const vote = (target: number | "abstain"): ToolCall => ({
  name: "vote",
  args: { target, beliefs: {}, reason: "test" },
});

/** A dealt table with its wolf and villager seats. */
export function dealt(seed = "table", n = 7) {
  const r = werewolf.setup({}, seed, seatsOf(n));
  if (!r.ok) throw new Error(r.error);
  const wolves = r.events
    .filter((e) => e.kind === "role_assigned" && e.data.role === "werewolf")
    .map((e) => e.data.seat as number);
  const villagers = seatsOf(n)
    .map((s) => s.seat)
    .filter((s) => !wolves.includes(s));
  return { state: r.state, wolves, villagers };
}

/** Seats currently asked to act. */
export function actors(state: WerewolfState): number[] {
  const step = werewolf.nextStep(state);
  return step.type === "turns" ? step.turns.map((t) => t.seat) : [];
}

/** Everyone in the current step votes as given (others in the step abstain). */
export function voteAll(state: WerewolfState, votes: Record<number, number | "abstain">) {
  const actions: Record<number, ToolCall | null> = {};
  for (const seat of actors(state)) actions[seat] = vote(votes[seat] ?? "abstain");
  return werewolf.applyActions(state, actions);
}

/** Wolves (in the current step) all choose `target`. */
export function nightKill(state: WerewolfState, target: number | null) {
  const actions: Record<number, ToolCall | null> = {};
  for (const seat of actors(state)) actions[seat] = target === null ? null : kill(target);
  return werewolf.applyActions(state, actions);
}
