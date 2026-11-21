import type { SeatAgent, ToolCall } from "../../src/core/ruleset";
import { werewolf } from "../../src/rulesets/werewolf";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";

export function seatsOf(n: number): SeatAgent[] {
  return Array.from({ length: n }, (_, i) => ({ seat: i + 1, agentId: `agent-${i + 1}`, label: `Agent ${i + 1}` }));
}

export const kill = (target: number): ToolCall => ({ name: "choose_kill", args: { target } });
export const inspect = (target: number): ToolCall => ({ name: "inspect", args: { target } });
export const protect = (target: number): ToolCall => ({ name: "protect", args: { target } });
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
  /** Every village-side seat (Seer and Doctor included). */
  const villagers = seatsOf(n)
    .map((s) => s.seat)
    .filter((s) => !wolves.includes(s));
  const roleSeat = (role: string) => r.state.players.find((p) => p.role === role)!.seat;
  return { state: r.state, wolves, villagers, seer: roleSeat("seer"), doctor: roleSeat("doctor") };
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

/** Skip tonight's Wolf Chat (every wolf stays silent), reaching the Night's action step. */
export function toNightAction(state: WerewolfState): WerewolfState {
  let s = state;
  while (s.phase === "night" && s.night.step === "wolf_chat") {
    s = werewolf.applyActions(s, Object.fromEntries(actors(s).map((seat) => [seat, null]))).state;
  }
  return s;
}

/**
 * Resolve the Night's action step: wolves (if not given in `others`) choose `target`,
 * other actors use `others` or the default.
 */
export function nightActions(state: WerewolfState, target: number | null, others: Record<number, ToolCall | null> = {}) {
  const s = toNightAction(state);
  const actions: Record<number, ToolCall | null> = {};
  for (const seat of actors(s)) {
    const isWolf = s.players.find((p) => p.seat === seat)?.role === "werewolf";
    actions[seat] = seat in others ? others[seat]! : isWolf && target !== null ? kill(target) : null;
  }
  return werewolf.applyActions(s, actions);
}

/** Play through tonight: Wolf Chat silent, wolves all choose `target`, no Seer or Doctor action. */
export const nightKill = (state: WerewolfState, target: number | null) => nightActions(state, target);
