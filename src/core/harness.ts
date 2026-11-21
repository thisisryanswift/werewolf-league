// The Harness interface: turns a game prompt into an Agent's action.
// Implementations: Fake Harness (src/harness/fake.ts) and the Managed Agent
// harness (src/harness/managed-agent/). All values are JSON so the Player DO can
// persist them between alarms.

import type { ToolCall, ToolSpec, TurnRequest } from "./ruleset";
import type { UsageReading } from "./usage";

export type { Usage, UsageReading } from "./usage";

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

/**
 * Usage: every Harness method may return `usage`, readings of the model calls it
 * saw reach a final status (including cancelled ones, whose tokens were billed).
 * The same call may be read again later; readings share its ID (see UsageReading).
 */
export type PollResult =
  | {
      status: "pending";
      handle: TurnHandle;
      /** True if the poll was refused with a 429; the Player DO reports it to the League. */
      rateLimited?: boolean;
      /** Poll no sooner than this (the Player DO still wakes for the deadline). */
      retryAfterMs?: number;
    }
  /**
   * `call: null` means the turn ended without a custom function call. `notes`: the seat's
   * private scratchpad as this turn last wrote it, if it did (Narrator's View only, never
   * shown to Players). Best effort: a Harness that can't read it leaves it out.
   */
  | { status: "done"; call: ToolCall | null; usage?: UsageReading[]; notes?: string }
  | { status: "error"; message: string; usage?: UsageReading[] };

/** What `cancel` returns: updated chain state to persist, and the cancelled call's usage. */
export interface CancelResult {
  chain?: Record<string, unknown>;
  usage?: UsageReading[];
}

export interface Harness {
  /** Prepare the seat's environment at Match start. Returns updated chain state. */
  provision(ctx: PlayerContext): Promise<Record<string, unknown>>;
  /** Start a turn in the background. Returns the handle and updated chain state. */
  startTurn(
    ctx: PlayerContext,
    input: TurnInput,
  ): Promise<{ handle: TurnHandle; chain: Record<string, unknown>; usage?: UsageReading[] }>;
  poll(ctx: PlayerContext, handle: TurnHandle): Promise<PollResult>;
  /**
   * Best-effort cancel of an in-flight turn that missed its deadline. Optional. After it,
   * `poll` never returns that turn's call, and the seat's next `startTurn` recovers,
   * carrying every observation the seat missed. Harnesses may return updated chain
   * state; persist it if returned (then a call that landed just before the cancel is
   * reported to the Agent as "not used"). `startTurn` also settles a turn still in flight.
   * Returns the cancelled call's usage if it can be read.
   */
  cancel?(ctx: PlayerContext, handle: TurnHandle): Promise<CancelResult | void>;
  /**
   * The Match is over: settle anything still open that was billed, such as a setup
   * interaction of a seat that never took a turn, and return its usage. Optional.
   */
  close?(ctx: PlayerContext): Promise<CancelResult | void>;
}

/**
 * True for an error a Harness threw because the model API refused with a 429
 * (any error carrying `status: 429`, e.g. the managed-agent harness's ApiError).
 */
export function isRateLimited(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { status?: unknown }).status === 429;
}
