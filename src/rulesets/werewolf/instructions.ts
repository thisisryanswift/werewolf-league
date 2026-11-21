// Werewolf Agent Instructions (wl-cizy): the human-authored source and the
// sections each role receives, in order.

import source from "../../../docs/agent-instructions/werewolf.md";
import type { Seat } from "../../core/ruleset";
import type { Role, WerewolfState } from "./types";

export const SECTIONS_BY_ROLE: Record<Role, string[]> = {
  villager: ["shared", "village"],
  seer: ["shared", "village", "seer"],
  doctor: ["shared", "village", "doctor"],
  werewolf: ["shared", "werewolf"],
};

export const instructions = {
  source,
  sections(state: WerewolfState, seat: Seat): string[] {
    const player = state.players.find((p) => p.seat === seat);
    if (!player) throw new Error(`no seat ${seat}`);
    return SECTIONS_BY_ROLE[player.role];
  },
};
