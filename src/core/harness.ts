// The Harness interface: turns a game prompt into an Agent's action.
// Implementations: Fake Harness (src/harness/fake.ts) and the Managed Agent
// harness (src/harness/managed-agent/). All values are JSON so the Player DO can
// persist them between alarms.

import type { ToolCall, ToolSpec, TurnRequest } from "./ruleset";

/** An Agent from the roster: model + Agent Instructions + harness. */
export interface AgentConfig {
  id: string;
  name: string;
  harness: string; // "fake" | "managed-agent" | ...
  /** Model for model-backed harnesses, e.g. "gemini-4-hydrogen" (managed-agent default). */
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
  /**
   * The seat's Agent Instructions, assembled by the Match from the Ruleset-named
   * sections. Harnesses deliver them at provisioning (managed-agent: /.agents/AGENTS.md).
   */
  instructions?: string;
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
  /**
   * Best-effort cancel of an in-flight turn that missed its deadline. Optional. After it,
   * `poll` never returns that turn's call, and the seat's next `startTurn` recovers,
   * carrying every observation the seat missed. Harnesses may return updated chain
   * state; persist it if returned (then a call that landed just before the cancel is
   * reported to the Agent as "not used"). `startTurn` also settles a turn still in flight.
   */
  cancel?(ctx: PlayerContext, handle: TurnHandle): Promise<Record<string, unknown> | void>;
}
