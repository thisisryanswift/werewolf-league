// Tool definitions (ADR-0002): each seat gets its role's full tool list once,
// for the whole Match. Shapes follow spec wl-xgp7 "Agent tools".

import type { ToolSpec } from "../../core/ruleset";
import type { Role } from "./types";

const seat = { type: "integer", description: "Seat number" };

export const SPEAK: ToolSpec = {
  name: "speak",
  description: "Say something to the whole table during the Day.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string" },
      accuse: { type: "array", items: seat },
      defend: { type: "array", items: seat },
      claim: {
        type: "object",
        properties: {
          role: { type: "string" },
          results: {
            type: "array",
            items: { type: "object", properties: { seat, side: { type: "string" } }, required: ["seat", "side"] },
          },
        },
        required: ["role"],
      },
    },
    required: ["text"],
  },
};

export const VOTE: ToolSpec = {
  name: "vote",
  description: 'Vote to eliminate a player at the end of the Day, or "abstain".',
  parameters: {
    type: "object",
    properties: {
      target: { description: 'Seat number, or "abstain"', anyOf: [seat, { type: "string", enum: ["abstain"] }] },
      beliefs: {
        type: "object",
        description: "Your P(werewolf) for each other living player, keyed by seat number",
        additionalProperties: { type: "number" },
      },
      reason: { type: "string" },
    },
    required: ["target", "beliefs", "reason"],
  },
};

export const CHOOSE_KILL: ToolSpec = {
  name: "choose_kill",
  description: "Werewolves only, at Night: choose a living non-Werewolf player to kill.",
  parameters: { type: "object", properties: { target: seat }, required: ["target"] },
};

/** Tools per role. Night-role tickets extend this table. */
export const TOOLS_BY_ROLE: Record<Role, ToolSpec[]> = {
  werewolf: [SPEAK, VOTE, CHOOSE_KILL],
  villager: [SPEAK, VOTE],
};
