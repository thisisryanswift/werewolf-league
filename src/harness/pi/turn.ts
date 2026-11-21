// One pi turn's game-tool handling, free of Pi and Durable Object types so it is
// unit-tested against fakes. A seat's game tool calls land here:
// - the first call the Match says is legal wins and ends the run (terminate);
// - an illegal call gets the Match's error back (isError), so the model retries in the same run;
// - every later call in the turn (or a call after the turn was cancelled) is ignored.

import type { ToolCall } from "../../core/ruleset";

/** The turn a pi seat is playing, as persisted in the seat DO. */
export interface PiTurn {
  /** Pi operation id of the run that plays this turn. */
  opId: string;
  /** The Match's turn ID, used to ask the Match whether a call is legal. */
  turnId: string;
  /** The first legal call, once made. */
  accepted: ToolCall | null;
  /** Set by cancel: the turn is over and no call may be accepted. */
  cancelled?: boolean;
}

/** Where the current turn is kept (the seat DO's storage; a Map in tests). Synchronous, like DO KV. */
export interface TurnStore {
  get(): PiTurn | undefined;
  put(turn: PiTurn): void;
}

/** Asks the Match whether `call` is legal for its turn `turnId` (validate only; records nothing). */
export type CheckCall = (turnId: string, call: ToolCall) => Promise<{ ok: true } | { ok: false; error: string }>;

/** Pi's tool result shape, reduced to what game tools return. */
export interface GameToolResult {
  output: { type: "text"; text: string }[];
  isError?: boolean;
  control?: { terminate: true };
}

const text = (t: string) => [{ type: "text" as const, text: t }];

export const ACCEPTED = "Recorded. Your turn is over.";
export const IGNORED = "Ignored: only one action per turn counts, and your turn has already ended.";

export async function handleGameCall(store: TurnStore, opId: string, call: ToolCall, check: CheckCall): Promise<GameToolResult> {
  const ignored = (): GameToolResult => ({ output: text(IGNORED), control: { terminate: true } });
  const before = store.get();
  if (!before || before.opId !== opId || before.accepted || before.cancelled) return ignored();
  const v = await check(before.turnId, call).catch((err: unknown) => ({ ok: false as const, error: `The game could not check this call (${String(err)}). Try again.` }));
  // Re-read: a parallel call, a cancel or a new turn may have landed while the Match answered.
  const now = store.get();
  if (!now || now.opId !== opId || now.accepted || now.cancelled) return ignored();
  if (!v.ok) return { output: text(v.error), isError: true };
  store.put({ ...now, accepted: call });
  return { output: text(ACCEPTED), control: { terminate: true } };
}
