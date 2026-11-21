// Plain-fetch REST client for the Gemini Interactions API (Managed Agents).
// Request shapes are the ones proven by FINDINGS.md and the M1 check (scripts/m1/chain.ts).
// Errors carry the status and a slice of the response body, never request headers.

import type { UsageReading } from "../../core/usage";

export const API_BASE = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const AGENT = "antigravity-preview-09-2026";

export interface Step {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

export interface Interaction {
  id: string;
  status: string;
  environment_id?: string;
  steps?: Step[];
  /** REST usage: total_input_tokens (includes total_cached_tokens), total_thought_tokens, total_output_tokens. */
  usage?: Record<string, unknown>;
}

/** Statuses in which an interaction is still running. */
export const ACTIVE = new Set(["in_progress", "queued"]);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class InteractionsClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: Fetch,
  ) {}

  private async call(method: string, path: string, body?: unknown, timeoutMs?: number): Promise<Interaction> {
    const request = this.fetchFn(API_BASE + path, {
      method,
      headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await (timeoutMs === undefined
      ? request
      : Promise.race([
          request,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${method} interactions${path} timed out after ${timeoutMs} ms`)), timeoutMs),
          ),
        ]));
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, `${method} interactions${path} -> ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as Interaction;
  }

  create(body: unknown): Promise<Interaction> {
    return this.call("POST", "", body);
  }
  /** Get; with `timeoutMs`, give up waiting. */
  get(id: string, timeoutMs?: number): Promise<Interaction> {
    return this.call("GET", `/${id}`, undefined, timeoutMs);
  }
  /** Cancel; with `timeoutMs`, give up waiting (the cancel may still land). */
  cancel(id: string, timeoutMs?: number): Promise<Interaction> {
    return this.call("POST", `/${id}/cancel`, {}, timeoutMs);
  }
}

/** The interaction's billed usage as a generic reading, or null if the API reported none. */
export function readUsage(it: Interaction, model: string): UsageReading | null {
  const u = it.usage;
  if (!u) return null;
  const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : 0);
  return {
    id: it.id,
    model,
    usage: { input: n("total_input_tokens"), cached: n("total_cached_tokens"), thought: n("total_thought_tokens"), output: n("total_output_tokens") },
  };
}

/** Unanswered calls to the seat's own tools. Filesystem calls auto-run and already carry results. */
export function pendingCalls(it: Interaction, toolNames: string[]): { id: string; name: string; args: Record<string, unknown> }[] {
  const steps = it.steps ?? [];
  const answered = new Set(steps.filter((s) => s.type === "function_result").map((s) => s.call_id));
  return steps
    .filter((s) => s.type === "function_call" && s.id && s.name && toolNames.includes(s.name) && !answered.has(s.id))
    .map((s) => ({ id: s.id!, name: s.name!, args: s.arguments ?? {} }));
}

/** The seat's private scratchpad, as the Agent Instructions name it. */
export const NOTES_FILE = "/notes.md";

/**
 * The last content the interaction wrote to /notes.md, read from its auto-run
 * write_to_file steps (FINDINGS 5: `{ TargetFile, CodeContent }`); undefined if none.
 */
export function notesWritten(it: Interaction): string | undefined {
  let notes: string | undefined;
  for (const s of it.steps ?? []) {
    if (s?.type !== "function_call" || s.name !== "write_to_file" || !s.arguments) continue;
    const { TargetFile: file, CodeContent: content } = s.arguments;
    if (typeof file !== "string" || typeof content !== "string") continue;
    if (`/${file.replace(/^(\.?\/)+/, "")}` === NOTES_FILE) notes = content;
  }
  return notes;
}
