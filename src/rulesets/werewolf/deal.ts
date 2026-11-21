// Setup: deal roles from the match seed and announce them.

import type { SeatAgent, SetupResult } from "../../core/ruleset";
import { rngFrom } from "../../core/rng";
import type { RulesetEvent } from "../../shared/protocol";
import { TOOLS_BY_ROLE } from "./tools";
import { DEFAULT_CONFIG, type Role, type WerewolfConfig, type WerewolfState } from "./types";

export function parseConfig(raw: Record<string, unknown>): WerewolfConfig {
  return { ...DEFAULT_CONFIG, ...(raw as Partial<WerewolfConfig>) };
}

/** Roles for a table of `n` seats, before shuffling. */
export function roleList(n: number): Role[] {
  return ["werewolf", "werewolf", ...Array<Role>(n - 2).fill("villager")];
}

export function setup(rawConfig: Record<string, unknown>, seed: string, seats: SeatAgent[]): SetupResult<WerewolfState> {
  const config = parseConfig(rawConfig);
  if (seats.length < 4) return { ok: false, error: `Werewolf needs at least 4 seats, got ${seats.length}` };
  const roles = rngFrom(`${seed}:deal`).shuffle(roleList(seats.length));
  const players = seats.map((s, i) => ({ ...s, role: roles[i]!, alive: true }));
  const state: WerewolfState = {
    config,
    seed,
    players,
    cycle: 1,
    phase: "night",
    night: { step: "kill" },
    day: { step: "vote" },
    winner: null,
  };
  const wolves = players.filter((p) => p.role === "werewolf").map((p) => p.seat);
  const events: RulesetEvent[] = [
    {
      kind: "match_setup",
      audience: "all",
      data: { ruleset: "werewolf", seats: players.map((p) => ({ seat: p.seat, label: p.label, agentId: p.agentId })) },
    },
    ...players.map((p): RulesetEvent => ({ kind: "role_assigned", audience: [p.seat], data: { seat: p.seat, role: p.role } })),
    { kind: "wolf_team", audience: wolves, data: { wolves } },
    { kind: "phase_started", audience: "all", data: { phase: "night", cycle: 1 } },
  ];
  const tools = Object.fromEntries(players.map((p) => [p.seat, TOOLS_BY_ROLE[p.role]]));
  return { ok: true, state, events, tools };
}
