import type { Seat, ToolCall, TurnRequest, Validation } from "../../core/ruleset";
import type { RulesetEvent } from "../../shared/protocol";

export type Role = "werewolf" | "seer" | "doctor" | "villager";
export type Side = "wolf" | "village";

export const SIDE_OF: Record<Role, Side> = { werewolf: "wolf", seer: "village", doctor: "village", villager: "village" };

export interface WerewolfConfig {
  seats: number; // 7 or 8
  allowAbstain: boolean;
  /** After this many Day/Night cycles, Werewolves win if any survive. */
  maxCycles: number;
}

export const DEFAULT_CONFIG: WerewolfConfig = { seats: 7, allowAbstain: true, maxCycles: 6 };

export interface PlayerState {
  seat: Seat;
  agentId: string;
  label: string;
  role: Role;
  alive: boolean;
}

/**
 * Night sub-state, owned by night.ts. Each Night starts from `startNight` (night.ts):
 * Wolf Chat exchanges first (skipped with fewer than two living Werewolves), then one
 * "act" step where the Werewolves choose a kill while the Seer inspects and the Doctor protects.
 */
export interface NightState {
  step: "wolf_chat" | "act";
  /** Current Wolf Chat exchange, 1-based (meaningful while step is "wolf_chat"). */
  exchange: number;
  /** Who the Doctor protected on the previous Night, if anyone; illegal to protect tonight. */
  lastProtected: Seat | null;
}

/** Day sub-state, owned by day.ts. */
export interface DayState {
  step: "vote";
}

export interface WerewolfState {
  config: WerewolfConfig;
  seed: string;
  players: PlayerState[];
  /** Day/Night cycle number, starting at 1 (Night 1, then Day 1). */
  cycle: number;
  phase: "night" | "day" | "over";
  night: NightState;
  day: DayState;
  winner: Side | null;
}

/** One phase of the game. index.ts dispatches to the module for `state.phase`. */
export interface PhaseModule {
  turns(state: WerewolfState): TurnRequest[];
  validate(state: WerewolfState, seat: Seat, call: ToolCall): Validation;
  apply(state: WerewolfState, actions: Record<Seat, ToolCall | null>): { state: WerewolfState; events: RulesetEvent[] };
}
