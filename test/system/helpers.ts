import { exports } from "cloudflare:workers";
import { werewolf } from "../../src/rulesets/werewolf";
import type { TimeoutCounts } from "../../src/core/deadlines";
import type { AgentConfig } from "../../src/core/harness";
import { applyLeagueDiff } from "../../src/shared/league-feed";
import type { LeagueMessage, LeagueSnapshot, MatchEvent, ServerMessage } from "../../src/shared/protocol";

export const ADMIN = { "x-admin-secret": "test-admin-secret" };

/** League config for tests that aren't about pacing: starts as fast as Matches finish, short feed interval. */
export const UNPACED = { startsPerWindow: 1000, startWindowMs: 1, feedIntervalMs: 20 };

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

/**
 * A League feed client: folds every message (join snapshot, then coalesced
 * "tiles" diffs) into the snapshot a grid would show, one state per message.
 */
export async function connectLeague(
  open: () => Promise<Response> = () => exports.default.fetch("http://test/api/league/ws", { headers: { Upgrade: "websocket" } }),
) {
  const res = await open();
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket: ${res.status}`);
  const messages: LeagueMessage[] = [];
  const states: LeagueSnapshot[] = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data as string) as LeagueMessage;
    messages.push(msg);
    const last = states.at(-1);
    if (msg.type === "league") states.push(msg.league);
    else if (msg.type === "tiles" && last) states.push(applyLeagueDiff(last, msg));
    else if (msg.type === "leaderboard" && last) states.push({ ...last, leaderboard: msg.leaderboard });
  });
  ws.accept();
  await waitFor(async () => states.length > 0);
  return { ws, messages, states, latest: () => states.at(-1)!, close: () => ws.close(1000, "bye") };
}

/** The game decisions of a log, without operational fields. */
export const decisions = (events: MatchEvent[]) => events.map(({ kind, audience, data }) => ({ kind, audience, data }));

/** Wolf seats the Werewolf Ruleset deals for a 7-seat table of distinct Agents with this seed. */
export function dealtWolves(seed: string): number[] {
  const seats = Array.from({ length: 7 }, (_, i) => ({ seat: i + 1, agentId: `x${i}`, label: "x", displayName: `N${i + 1}` }));
  const r = werewolf.setup({}, seed, seats);
  if (!r.ok) throw new Error(r.error);
  return r.events.find((e) => e.kind === "wolf_team")!.data.wolves as number[];
}
