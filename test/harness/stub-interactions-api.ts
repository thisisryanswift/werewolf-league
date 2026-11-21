// A stubbed Gemini Interactions API for Managed Agent harness tests. It enforces
// the behaviour measured in FINDINGS.md and M1 (wl-ewd7): continuations must
// resend identical tools and answer a pending call of the parent; cancelling an
// active interaction leaves its parent's call pending; `environment_id` comes
// back on the create() response. The real API is never called.

export interface StubRequest {
  method: string;
  path: string;
  body: any;
  apiKey: string | null;
}

interface StubInteraction {
  id: string;
  status: string;
  environment_id: string;
  steps: any[];
  body: any;
}

let callSeq = 0;

export class StubInteractionsApi {
  requests: StubRequest[] = [];
  interactions = new Map<string, StubInteraction>();
  /** When set, the next create() answers with this HTTP status. */
  failNextCreate: number | null = null;
  /** When true, cancel requests never get a response (a hung cancel). */
  hangCancels = false;
  /**
   * Interactions whose Agent call lands just as the cancel arrives: cancelling them
   * leaves them in requires_action with this call (the late-result race).
   */
  landOnCancel = new Map<string, { name: string; args: Record<string, unknown> }>();
  private n = 0;

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/v1beta\/interactions/, "");
    const text = await req.text();
    const body = text ? JSON.parse(text) : undefined;
    this.requests.push({ method: req.method, path, body, apiKey: req.headers.get("x-goog-api-key") });
    if (req.method === "POST" && path === "") return this.create(body);
    const cancel = /^\/([^/]+)\/cancel$/.exec(path);
    if (req.method === "POST" && cancel) {
      if (this.hangCancels) return new Promise<Response>(() => {});
      return this.cancel(cancel[1]!);
    }
    const get = /^\/([^/]+)$/.exec(path);
    if (req.method === "GET" && get) {
      const it = this.interactions.get(get[1]!);
      return it ? json(view(it)) : json({ error: { message: "not found" } }, 404);
    }
    return json({ error: { message: "no such route" } }, 404);
  };

  private create(body: any): Response {
    if (this.failNextCreate) {
      const status = this.failNextCreate;
      this.failNextCreate = null;
      return json({ error: { message: "stubbed failure" } }, status);
    }
    if (!body?.environment) return json({ error: { message: "Missing required field 'environment'" } }, 400);
    if (!Array.isArray(body.tools) || body.tools.length === 0) {
      return json({ error: { message: "this stub requires an explicit non-empty tools list" } }, 400);
    }
    if (body.previous_interaction_id) {
      const parent = this.interactions.get(body.previous_interaction_id);
      if (!parent) return json({ error: { message: "parent not found" } }, 404);
      if (JSON.stringify(parent.body.tools) !== JSON.stringify(body.tools)) {
        return json({ error: { message: "tools must match the interaction referenced by previous_interaction_id" } }, 400);
      }
      const pending = pendingCalls(parent).map((s) => s.id);
      const answered = (body.input as any[]).filter((i) => i.type === "function_result").map((i) => i.call_id);
      if (parent.status !== "requires_action" || answered.length === 0 || answered.some((id) => !pending.includes(id))) {
        return json({ error: { message: "received tool response but no client tool call is pending" } }, 400);
      }
    }
    this.n += 1;
    const id = `int-${this.n}`;
    const environment_id = body.environment === "remote" ? `env-${this.n}` : body.environment;
    const it: StubInteraction = { id, status: "in_progress", environment_id, steps: [], body };
    this.interactions.set(id, it);
    return json(view(it));
  }

  private cancel(id: string): Response {
    const it = this.interactions.get(id);
    if (!it) return json({ error: { message: "not found" } }, 404);
    const landing = this.landOnCancel.get(id);
    if (landing && it.status === "in_progress") this.callTool(id, landing.name, landing.args);
    if (it.status === "in_progress") it.status = "cancelled";
    return json(view(it));
  }

  // ---- scripting the Agent ------------------------------------------------

  /** The interaction created most recently. */
  latest(): StubInteraction {
    return [...this.interactions.values()].at(-1)!;
  }

  /** Requests that created interactions, in order. */
  creates(): any[] {
    return this.requests.filter((r) => r.method === "POST" && r.path === "").map((r) => r.body);
  }

  /** The Agent pauses on a custom function call (optionally after auto-run filesystem calls). */
  callTool(id: string, name: string, args: Record<string, unknown>, opts: { filesystemFirst?: boolean } = {}): string {
    const it = this.interactions.get(id)!;
    const callId = `call_${++callSeq}`;
    if (opts.filesystemFirst) {
      const fsId = `call_${++callSeq}`;
      it.steps.push(
        { type: "function_call", id: fsId, name: "write_to_file", arguments: { TargetFile: "/notes.txt" } },
        { type: "function_result", call_id: fsId, result: "ok" },
      );
    }
    it.steps.push({ type: "thought" }, { type: "function_call", id: callId, name, arguments: args, signature: "sig" });
    it.status = "requires_action";
    return callId;
  }

  /** The Agent ends its turn without calling a tool. */
  complete(id: string): void {
    const it = this.interactions.get(id)!;
    it.steps.push({ type: "model_output", content: [{ type: "text", text: "I pass." }] });
    it.status = "completed";
  }
}

function pendingCalls(it: StubInteraction): any[] {
  const answered = new Set(it.steps.filter((s) => s.type === "function_result").map((s) => s.call_id));
  return it.steps.filter((s) => s.type === "function_call" && !answered.has(s.id));
}

function view(it: StubInteraction) {
  return { id: it.id, status: it.status, environment_id: it.environment_id, steps: it.steps };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** Text of a create body's input: the string, or every function_result/user_input payload. */
export function inputText(body: any): string {
  return typeof body.input === "string" ? body.input : JSON.stringify(body.input);
}
