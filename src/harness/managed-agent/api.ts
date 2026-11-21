// Plain-fetch REST client for the Gemini Interactions API (Managed Agents).
// Request shapes are the ones proven by FINDINGS.md and the M1 check (scripts/m1/chain.ts).
// Errors carry the status and a slice of the response body, never request headers.

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
  get(id: string): Promise<Interaction> {
    return this.call("GET", `/${id}`);
  }
  /** Cancel; with `timeoutMs`, give up waiting (the cancel may still land). */
  cancel(id: string, timeoutMs?: number): Promise<Interaction> {
    return this.call("POST", `/${id}/cancel`, {}, timeoutMs);
  }
}

/** Unanswered calls to the seat's own tools. Filesystem calls auto-run and already carry results. */
export function pendingCalls(it: Interaction, toolNames: string[]): { id: string; name: string; args: Record<string, unknown> }[] {
  const steps = it.steps ?? [];
  const answered = new Set(steps.filter((s) => s.type === "function_result").map((s) => s.call_id));
  return steps
    .filter((s) => s.type === "function_call" && s.id && s.name && toolNames.includes(s.name) && !answered.has(s.id))
    .map((s) => ({ id: s.id!, name: s.name!, args: s.arguments ?? {} }));
}
