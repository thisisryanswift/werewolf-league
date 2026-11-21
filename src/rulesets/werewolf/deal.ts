// Setup: deal roles from the match seed and announce them.

import type { Seat, SeatAgent, SetupResult } from "../../core/ruleset";
import { rngFrom } from "../../core/rng";
import type { RulesetEvent } from "../../shared/protocol";
import { startDay, voteTool } from "./day";
import { startNight } from "./night";
import { TOOLS_BY_ROLE } from "./tools";
import { DEFAULT_CONFIG, type Role, type WerewolfConfig, type WerewolfState } from "./types";

export function parseConfig(raw: Record<string, unknown>): WerewolfConfig {
  return { ...DEFAULT_CONFIG, ...(raw as Partial<WerewolfConfig>) };
}

/** Roles for a table of `n` seats, before shuffling. */
export function roleList(n: number): Role[] {
  return ["werewolf", "werewolf", "seer", "doctor", ...Array<Role>(n - 4).fill("villager")];
}

/**
 * Two Werewolf seats from different Agents, chosen from the seed: the first seat in a
 * seeded shuffle, then the first later seat on another Agent. Null if all seats share an Agent.
 */
export function pickWolves(seed: string, seats: SeatAgent[]): [Seat, Seat] | null {
  const order = rngFrom(`${seed}:deal:wolves`).shuffle(seats);
  const first = order[0];
  const second = order.find((s) => first && s.agentId !== first.agentId);
  return first && second ? [first.seat, second.seat] : null;
}

export function setup(rawConfig: Record<string, unknown>, seed: string, seats: SeatAgent[]): SetupResult<WerewolfState> {
  const config = parseConfig(rawConfig);
  if (seats.length < 4) return { ok: false, error: `Werewolf needs at least 4 seats, got ${seats.length}` };
  const wolfPair = pickWolves(seed, seats);
  if (!wolfPair) return { ok: false, error: "Werewolf needs its two Werewolf seats on different Agents, but every seat is the same Agent" };
  // Remaining roles are shuffled over the remaining seats.
  const others = rngFrom(`${seed}:deal:others`).shuffle(roleList(seats.length).filter((r) => r !== "werewolf"));
  let next = 0;
  const players = seats.map((s) => ({
    ...s,
    role: wolfPair.includes(s.seat) ? ("werewolf" as Role) : others[next++]!,
    alive: true,
  }));
  const state: WerewolfState = {
    config,
    seed,
    players,
    cycle: 1,
    phase: "night",
    night: startNight(players, null),
    day: startDay({ seed, players }, 1, null),
    ballots: [],
    winner: null,
  };
  const wolves = players.filter((p) => p.role === "werewolf").map((p) => p.seat);
  const events: RulesetEvent[] = [
    {
      kind: "match_setup",
      audience: "all",
      data: { ruleset: "werewolf", seats: players.map((p) => ({ seat: p.seat, label: p.label, displayName: p.displayName, agentId: p.agentId })) },
    },
    ...players.map((p): RulesetEvent => ({ kind: "role_assigned", audience: [p.seat], data: { seat: p.seat, role: p.role } })),
    { kind: "wolf_team", audience: wolves, data: { wolves } },
    { kind: "phase_started", audience: "all", data: { phase: "night", cycle: 1 } },
  ];
  const vote = voteTool(config.allowAbstain);
  const tools = Object.fromEntries(
    players.map((p) => [p.seat, TOOLS_BY_ROLE[p.role].map((t) => (t.name === vote.name ? vote : t))]),
  );
  return { ok: true, state, events, tools };
}
