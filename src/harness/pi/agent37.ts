// Minimal Agent37 sandbox client (https://www.agent37.com/docs/llms.txt), as measured in
// the pi spike: the main API takes `Authorization: Bearer`, the exec host takes `X-Agent37-Key`.

export const AGENT37_API = "https://api.agent37.com/v1";
export const AGENT37_SANDBOX = "https://sandbox.agent37.app/v1";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ExecResult {
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export class Agent37 {
  constructor(
    private readonly key: string,
    private readonly fetchFn: Fetch = (i, init) => fetch(i, init),
  ) {}

  private bearer() {
    return { authorization: `Bearer ${this.key}`, "content-type": "application/json" };
  }

  private async json(res: Response, what: string): Promise<Record<string, unknown>> {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`agent37 ${what}: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    return body;
  }

  /** Create a sandbox with egress deny-all. Returns its instance ID. */
  async create(name: string): Promise<string> {
    const res = await this.fetchFn(`${AGENT37_API}/instances`, {
      method: "POST",
      headers: this.bearer(),
      body: JSON.stringify({ name, template: "agent37-base", resources: { cpu: 2, memory: 4, disk: 2 }, network: "deny-all" }),
    });
    const body = await this.json(res, "create");
    if (typeof body.id !== "string") throw new Error("agent37 create: no instance id");
    return body.id;
  }

  async exec(id: string, command: string, timeoutMs = 20_000): Promise<ExecResult> {
    const res = await this.fetchFn(`${AGENT37_SANDBOX}/instances/${encodeURIComponent(id)}/exec`, {
      method: "POST",
      headers: { "x-agent37-key": this.key, "content-type": "application/json" },
      body: JSON.stringify({ command }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await res.json().catch(() => ({ error: `exec: ${res.status}` }))) as ExecResult;
  }

  async delete(id: string): Promise<void> {
    const res = await this.fetchFn(`${AGENT37_API}/instances/${encodeURIComponent(id)}`, { method: "DELETE", headers: this.bearer() });
    // Already gone counts as deleted.
    if (res.status === 404) return;
    await this.json(res, "delete");
  }

  /** Instances whose name starts with `prefix`. */
  async list(prefix: string): Promise<{ id: string; name: string; created_at?: string }[]> {
    const res = await this.fetchFn(`${AGENT37_API}/instances`, { headers: this.bearer() });
    const body = await this.json(res, "list");
    const data = (body.data ?? []) as { id: string; name?: string; created_at?: string }[];
    return data.filter((i) => String(i.name ?? "").startsWith(prefix)).map((i) => ({ id: i.id, name: String(i.name), created_at: i.created_at }));
  }
}
