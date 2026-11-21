import { exports } from "cloudflare:workers";
import { werewolf } from "../../src/rulesets/werewolf";
import type { TimeoutCounts } from "../../src/core/deadlines";
import type { AgentConfig } from "../../src/core/harness";
import type { MatchEvent, ServerMessage } from "../../src/shared/protocol";

export const ADMIN = { "x-admin-secret": "test-admin-secret" };

export function fakeAgent(id: string, options: Record<string, unknown> = {}): AgentConfig {
  return { id, name: id, harness: "fake", options };
}

export async function startMatch(body: Record<string, unknown>): Promise<string> {
  const res = await exports.default.fetch("http://test/api/admin/matches", {
    method: "POST",
    headers: { ...ADMIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`start failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { matchId: string }).matchId;
}

export interface Snapshot {
  matchId: string;
  status: "running" | "finished";
  result: { winner: string; sides: Record<string, string>; timeouts: TimeoutCounts } | null;
  stats: { timeouts: TimeoutCounts };
  events: MatchEvent[];
}

export async function snapshot(matchId: string): Promise<Snapshot> {
  const res = await exports.default.fetch(`http://test/api/matches/${matchId}`);
  if (!res.ok) throw new Error(`snapshot failed: ${res.status}`);
  return res.json();
}

export async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const finished = (matchId: string) =>
  waitFor(async () => {
    const s = await snapshot(matchId);
    return s.status === "finished" ? s : null;
  });

/** A Spectator connection that records every message. */
export async function connect(matchId: string) {
  const res = await exports.default.fetch(`http://test/api/matches/${matchId}/ws`, { headers: { Upgrade: "websocket" } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket: ${res.status}`);
  const messages: ServerMessage[] = [];
  ws.addEventListener("message", (m) => messages.push(JSON.parse(m.data as string)));
  ws.accept();
  return { ws, messages, close: () => ws.close(1000, "bye") };
}

/** The game decisions of a log, without operational fields. */
export const decisions = (events: MatchEvent[]) => events.map(({ kind, audience, data }) => ({ kind, audience, data }));

/** Wolf seats the Werewolf Ruleset deals for a 7-seat table of distinct Agents with this seed. */
export function dealtWolves(seed: string): number[] {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `x${i}`, label: "x" }));
  const r = werewolf.setup({}, seed, seats);
  if (!r.ok) throw new Error(r.error);
  return r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
}
