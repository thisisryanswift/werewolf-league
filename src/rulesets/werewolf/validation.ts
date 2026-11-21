import type { Seat, ToolCall, TurnRequest, Validation } from "../../core/ruleset";
import { asSeat } from "./players";

/** Check a targeted call against the seat's turn request. Errors always name the required action. */
export function validateTargeted(turn: TurnRequest | undefined, seat: Seat, call: ToolCall): Validation {
  if (!turn) return { ok: false, error: `Seat ${seat} has no action to take right now. Wait for your next turn.` };
  const required = `Required action: ${turn.actionKind} with target one of ${turn.legalTargets.join(", ")}.`;
  if (call.name !== turn.actionKind) {
    return { ok: false, error: `${call.name} is not allowed now. ${required}` };
  }
  const raw = call.args.target;
  const target = raw === "abstain" ? "abstain" : asSeat(raw);
  if (target === null || !turn.legalTargets.includes(target)) {
    return { ok: false, error: `${JSON.stringify(raw)} is not a legal target. ${required}` };
  }
  return { ok: true };
}

/** The validated target of a call, or null for a default (missing) action. */
export function targetOf(call: ToolCall | null | undefined): Seat | "abstain" | null {
  if (!call) return null;
  const raw = call.args.target;
  return raw === "abstain" ? "abstain" : asSeat(raw);
}
