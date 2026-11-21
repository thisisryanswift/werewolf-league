import type { Seat } from "../../core/ruleset";
import type { PlayerState, WerewolfState } from "./types";

export const alive = (s: WerewolfState): PlayerState[] => s.players.filter((p) => p.alive);
export const aliveWolves = (s: WerewolfState): PlayerState[] => alive(s).filter((p) => p.role === "werewolf");
export const player = (s: WerewolfState, seat: Seat): PlayerState | undefined => s.players.find((p) => p.seat === seat);
export const wolfSeats = (s: WerewolfState): Seat[] => s.players.filter((p) => p.role === "werewolf").map((p) => p.seat);

/** Copy of state with one Player dead. */
export function killPlayer(s: WerewolfState, seat: Seat): WerewolfState {
  return { ...s, players: s.players.map((p) => (p.seat === seat ? { ...p, alive: false } : p)) };
}

/** Parse a seat from a tool argument. */
export function asSeat(v: unknown): Seat | null {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : null;
}
