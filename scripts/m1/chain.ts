// M1 sanity check helpers: plain-fetch REST client for the Interactions API with the
// request shape decided in the spec (wl-xgp7, "Harness interface").
// Standalone measurement code. Not part of the Worker.

export const API = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const AGENT = "antigravity-preview-09-2026";
export const MAX_TOTAL_TOKENS = 100_000;

export type Step = { type: string; id?: string; call_id?: string; name?: string; arguments?: any; result?: any };
export type Interaction = {
  id: string;
  status: string;
  environment_id?: string;
  steps?: Step[];
  usage?: Record<string, number>;
  [k: string]: unknown;
};
export type PendingCall = { id: string; name: string; arguments: any };

/** The unanswered call to one of our game tools (filesystem tools auto-run and already have results). */
export function pendingGameCall(steps: Step[], gameTools: string[]): PendingCall | null {
  const answered = new Set(steps.filter((s) => s.type === "function_result").map((s) => s.call_id));
  const open = steps.filter(
    (s) => s.type === "function_call" && gameTools.includes(s.name!) && !answered.has(s.id),
  );
  const last = open.at(-1);
  return last ? { id: last.id!, name: last.name!, arguments: last.arguments } : null;
}

// ---------------------------------------------------------------- tools (spec shapes)

const SEATS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const seat = { type: "string", enum: SEATS };
const fn = (name: string, description: string, properties: any, required: string[]) => ({
  type: "function",
  name,
  description,
  parameters: { type: "object", properties, required },
});

export const SEER_TOOLS = [
  fn("speak", "Say something to the table during the Day discussion.", {
    text: { type: "string" },
    accuse: { type: "array", items: seat },
    defend: { type: "array", items: seat },
    claim: {
      type: "object",
      properties: {
        role: { type: "string", enum: ["villager", "seer", "doctor", "werewolf"] },
        results: {
          type: "array",
          items: { type: "object", properties: { seat, side: { type: "string", enum: ["village", "werewolf"] } } },
        },
      },
    },
  }, ["text"]),
  fn("vote", "Cast your elimination vote, with your probability that each other living player is a werewolf.", {
    target: { type: "string", enum: [...SEATS, "abstain"] },
    beliefs: { type: "object", properties: Object.fromEntries(SEATS.map((s) => [s, { type: "number" }])) },
    reason: { type: "string" },
  }, ["target", "beliefs", "reason"]),
  fn("inspect", "Seer night action: learn whether one living player is a werewolf.", { target: seat }, ["target"]),
];
export const SEER_TOOL_NAMES = SEER_TOOLS.map((t) => t.name);

// ---------------------------------------------------------------- REST

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method,
    headers: { "x-goog-api-key": key(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path || "/"} -> ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

export function firstTurnBody(model: string, environment: string, input: string) {
  return {
    agent: AGENT,
    agent_config: { type: "antigravity", model, max_total_tokens: MAX_TOTAL_TOKENS },
    tools: SEER_TOOLS,
    environment,
    background: true,
    store: true,
    input,
  };
}

export function continuationBody(model: string, parent: Interaction, pending: PendingCall, result: unknown) {
  return {
    agent: AGENT,
    agent_config: { type: "antigravity", model, max_total_tokens: MAX_TOTAL_TOKENS },
    tools: SEER_TOOLS, // identical list resent every continuation
    previous_interaction_id: parent.id,
    environment: parent.environment_id,
    background: true,
    store: true,
    input: [{ type: "function_result", name: pending.name, call_id: pending.id, result }],
  };
}

export const create = (body: unknown): Promise<Interaction> => call("POST", "", body);
export const get = (id: string): Promise<Interaction> => call("GET", `/${id}`);
export const cancel = (id: string): Promise<Interaction> => call("POST", `/${id}/cancel`, {});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACTIVE = new Set(["in_progress", "queued"]);

/** Poll until terminal or deadline; cancels on deadline. */
export async function poll(id: string, t0: number, deadlineS = 180, everyMs = 500): Promise<Interaction> {
  for (;;) {
    const it = await get(id);
    if (!ACTIVE.has(it.status)) return it;
    if ((performance.now() - t0) / 1000 > deadlineS) {
      await cancel(id);
      return get(id);
    }
    await sleep(everyMs);
  }
}

export function usage(it: Interaction) {
  const u = it.usage ?? {};
  return {
    input: u.total_input_tokens,
    cached: u.total_cached_tokens,
    thought: u.total_thought_tokens,
    output: u.total_output_tokens,
    total: u.total_tokens,
    raw: u,
  };
}
