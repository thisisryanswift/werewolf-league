import type { SeatAgent, ToolCall } from "../../src/core/ruleset";
import { werewolf } from "../../src/rulesets/werewolf";
import type { WerewolfState } from "../../src/rulesets/werewolf/types";
import type { RulesetEvent } from "../../src/shared/protocol";

export function seatsOf(n: number): SeatAgent[] {
  return Array.from({ length: n }, (_, i) => ({ seat: i + 1, agentId: `agent-${i + 1}`, label: `Agent ${i + 1}` }));
}

export const kill = (target: number): ToolCall => ({ name: "choose_kill", args: { target } });
export const vote = (target: number | "abstain", beliefs: Record<number, number> = {}): ToolCall => ({
  name: "vote",
  args: { target, beliefs, reason: "test" },
});
export const speak = (text: string, extra: Record<string, unknown> = {}): ToolCall => ({
  name: "speak",
  args: { text, ...extra },
});

/** A dealt table with its wolf and villager seats. */
export function dealt(seed = "table", n = 7, config: Record<string, unknown> = {}) {
  const r = werewolf.setup(config, seed, seatsOf(n));
  if (!r.ok) throw new Error(r.error);
  const wolves = r.events
    .filter((e) => e.kind === "role_assigned" && e.data.role === "werewolf")
    .map((e) => e.data.seat as number);
  const villagers = seatsOf(n)
    .map((s) => s.seat)
    .filter((s) => !wolves.includes(s));
  return { state: r.state, wolves, villagers };
}

/** The current step's turns. */
export function turnsOf(state: WerewolfState) {
  const step = werewolf.nextStep(state);
  return step.type === "turns" ? step.turns : [];
}

/** Seats currently asked to act. */
export function actors(state: WerewolfState): number[] {
  return turnsOf(state).map((t) => t.seat);
}

/** The required action of the current step (all turns share it). */
export const actionOf = (state: WerewolfState) => turnsOf(state)[0]?.actionKind;

/** Resolve the current step with `fn(seat)` per actor (null = default/timeout). */
export function act(state: WerewolfState, fn: (seat: number) => ToolCall | null) {
  return werewolf.applyActions(state, Object.fromEntries(actors(state).map((s) => [s, fn(s)])));
}

/**
 * Play the rest of the Day's speaking steps (Speech Rounds and Right of Reply)
 * with `speech(seat, stepIndex)`, collecting events, until the vote step.
 */
export function speakUntilVote(
  state: WerewolfState,
  speech: (seat: number, stepIndex: number) => ToolCall | null = () => null,
) {
  const events: RulesetEvent[] = [];
  let i = 0;
  while (actionOf(state) === "speak") {
    const step = i;
    const r = act(state, (seat) => speech(seat, step));
    events.push(...r.events);
    state = r.state;
    i++;
  }
  return { state, events };
}

/**
 * Skip any remaining speaking steps of the Day (every speech defaults), then everyone
 * votes as given (others in the step abstain). Returns the vote step's events.
 */
export function voteAll(state: WerewolfState, votes: Record<number, number | "abstain">) {
  state = speakUntilVote(state).state;
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

/** Through Night 1 with nobody killed, into Day 1 with everyone alive. */
export function day1(seed = "table", config: Record<string, unknown> = {}) {
  const t = dealt(seed, 7, config);
  return { ...t, state: nightKill(t.state, null).state };
}

/** Day 1 at its vote step, with every speech skipped. */
export function day1Vote(seed = "table", config: Record<string, unknown> = {}) {
  const t = day1(seed, config);
  return { ...t, state: speakUntilVote(t.state).state };
}
