// Wire protocol shared by the Worker and the frontend. Ruleset-agnostic.

/** Who may see an event: everyone, or only these seats (God View sees all). */
export type EventAudience = "all" | number[];

/** An event as produced by a Ruleset (or the Match runner). */
export interface RulesetEvent {
  kind: string;
  audience: EventAudience;
  data: Record<string, unknown>;
}

/** A committed event: strictly increasing `seq` within a Match. `ts` is operational. */
export interface MatchEvent extends RulesetEvent {
  seq: number;
  ts: number;
}

/** Messages sent from the Match WebSocket to a Spectator. */
export type ServerMessage =
  | { type: "log"; matchId: string; events: MatchEvent[] }
  | { type: "event"; event: MatchEvent };

/**
 * Merge incoming events into a seq-ordered log, dropping any seq already
 * present. Clients use this to dedupe across the join log, live events and
 * reconnects.
 */
export function mergeEvents(existing: MatchEvent[], incoming: MatchEvent[]): MatchEvent[] {
  const bySeq = new Map<number, MatchEvent>();
  for (const e of existing) bySeq.set(e.seq, e);
  for (const e of incoming) if (!bySeq.has(e.seq)) bySeq.set(e.seq, e);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}
