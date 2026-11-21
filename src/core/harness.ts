// The Harness interface: turns a game prompt into an Agent's action.
// Implementations: Fake Harness (src/harness/fake.ts). The Managed Agent
// harness lands in its own file. All values are JSON so the Player DO can
// persist them between alarms.

import type { ToolCall, ToolSpec, TurnRequest } from "./ruleset";

/** An Agent from the roster: model + Agent Instructions + harness. */
export interface AgentConfig {
  id: string;
  name: string;
  harness: string; // "fake" | "managed-agent" | ...
  model?: string;
  instructions?: string;
  /** Harness-specific options (e.g. a Fake Harness script). */
  options?: Record<string, unknown>;
}

/** Everything a Harness needs about the seat it plays. */
export interface PlayerContext {
  matchId: string;
  seat: number;
  agent: AgentConfig;
  tools: ToolSpec[];
  /** Opaque Harness-owned state (environment ID, last interaction ID, ...). */
  chain: Record<string, unknown>;
}

export interface TurnInput {
  /** Rendered observation (first turn: briefing + observation). */
  text: string;
  /** Structured turn request. Real harnesses only send `text`. */
  turn: TurnRequest;
  firstTurn: boolean;
  /** Error from the Match when the previous call was invalid; the Agent should retry. */
  error?: string;
}

/** Opaque, JSON-serializable handle to an in-flight turn. */
export type TurnHandle = Record<string, unknown>;

export type PollResult =
  | { status: "pending"; handle: TurnHandle }
  /** `call: null` means the turn ended without a custom function call. */
  | { status: "done"; call: ToolCall | null }
  | { status: "error"; message: string };

export interface Harness {
  /** Prepare the seat's environment at Match start. Returns updated chain state. */
  provision(ctx: PlayerContext): Promise<Record<string, unknown>>;
  /** Start a turn in the background. Returns the handle and updated chain state. */
  startTurn(ctx: PlayerContext, input: TurnInput): Promise<{ handle: TurnHandle; chain: Record<string, unknown> }>;
  poll(ctx: PlayerContext, handle: TurnHandle): Promise<PollResult>;
}
