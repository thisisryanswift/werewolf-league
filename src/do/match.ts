// Match DO: one per Match. Holds the seed, seats, Ruleset state and the
// append-only event log; drives the Ruleset, dispatches turns to Player DOs and
// broadcasts committed events to Spectators over hibernatable WebSockets.
// Ruleset-agnostic: it only talks to the Ruleset interface.

import { DurableObject } from "cloudflare:workers";
import {
  actionsOf,
  stepComplete,
  type MatchInit,
  type MatchSnapshot,
  type MatchStatus,
  type PendingStep,
  type SubmitResult,
  type TurnAssignment,
} from "../core/match";
import type { MatchResult, Ruleset, Seat, ToolCall, ToolSpec } from "../core/ruleset";
import { getRuleset } from "../rulesets";
import type { MatchEvent, RulesetEvent, ServerMessage } from "../shared/protocol";

interface MatchMeta extends MatchInit {
  status: MatchStatus;
  result: MatchResult | null;
  tools: Record<Seat, ToolSpec[]>;
  stepCount: number;
  /** Highest seq each seat has been shown in an observation. */
  lastSeen: Record<Seat, number>;
}

type EventRow = { seq: number; ts: number; kind: string; audience: string; data: string };

export class MatchDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        audience TEXT NOT NULL,
        data TEXT NOT NULL
      )`,
    );
  }

  // ---- storage helpers -------------------------------------------------

  private get meta(): MatchMeta | undefined {
    return this.ctx.storage.kv.get<MatchMeta>("meta");
  }
  private set meta(m: MatchMeta) {
    this.ctx.storage.kv.put("meta", m);
  }
  private get rulesetState(): unknown {
    return this.ctx.storage.kv.get("rulesetState");
  }
  private set rulesetState(s: unknown) {
    this.ctx.storage.kv.put("rulesetState", s);
  }
  private get step(): PendingStep | undefined {
    return this.ctx.storage.kv.get<PendingStep>("step");
  }
  private set step(s: PendingStep | undefined) {
    if (s) this.ctx.storage.kv.put("step", s);
    else this.ctx.storage.kv.delete("step");
  }

  private ruleset(meta: MatchMeta): Ruleset<unknown> {
    return getRuleset(meta.rulesetId);
  }

  private events(afterSeq = 0): MatchEvent[] {
    return this.ctx.storage.sql
      .exec<EventRow>("SELECT seq, ts, kind, audience, data FROM events WHERE seq > ? ORDER BY seq", afterSeq)
      .toArray()
      .map((r) => ({ seq: r.seq, ts: r.ts, kind: r.kind, audience: JSON.parse(r.audience), data: JSON.parse(r.data) }));
  }

  private lastSeq(): number {
    return this.ctx.storage.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM events").one().s ?? 0;
  }

  /** Commit events with the next sequence numbers and broadcast them. Synchronous: no interleaving. */
  private commit(events: RulesetEvent[]): void {
    let seq = this.lastSeq();
    const ts = Date.now();
    for (const e of events) {
      seq += 1;
      this.ctx.storage.sql.exec(
        "INSERT INTO events (seq, ts, kind, audience, data) VALUES (?, ?, ?, ?, ?)",
        seq,
        ts,
        e.kind,
        JSON.stringify(e.audience),
        JSON.stringify(e.data),
      );
      this.broadcast({ type: "event", event: { ...e, seq, ts } });
    }
  }

  private broadcast(msg: ServerMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // Closed socket; the runtime drops it.
      }
    }
  }

  // ---- RPC -------------------------------------------------------------

  private starting: Promise<void> | null = null;

  /**
   * Start the Match. Idempotent once started. Nothing is persisted until every
   * Player is provisioned, so a failed start leaves no Match behind and can be retried.
   */
  async start(init: MatchInit): Promise<void> {
    if (this.meta) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart(init).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStart(init: MatchInit): Promise<void> {
    const ruleset = getRuleset(init.rulesetId);
    const setup = ruleset.setup(init.config, init.seed, init.seats);
    if (!setup.ok) throw new Error(setup.error);
    await Promise.all(
      init.seats.map((s) =>
        this.env.PLAYER.getByName(`${init.matchId}:${s.seat}`).provision({
          matchId: init.matchId,
          seat: s.seat,
          agent: init.agents[s.seat]!,
          tools: setup.tools[s.seat]!,
        }),
      ),
    );
    // Persist and schedule together (no await between the writes).
    this.meta = { ...init, status: "running", result: null, tools: setup.tools, stepCount: 0, lastSeen: {} };
    this.rulesetState = setup.state;
    this.commit(setup.events);
    await this.ctx.storage.setAlarm(Date.now());
  }

  snapshot(): (MatchSnapshot & { events: MatchEvent[] }) | null {
    const meta = this.meta;
    if (!meta) return null;
    return {
      matchId: meta.matchId,
      rulesetId: meta.rulesetId,
      status: meta.status,
      seats: meta.seats,
      result: meta.result,
      events: this.events(),
    };
  }

  /** A Player reports its turn's action (`null` = no valid action, use the default). */
  async submitAction(turnId: string, seat: Seat, call: ToolCall | null): Promise<SubmitResult> {
    const meta = this.meta;
    const step = this.step;
    const turn = step?.turns.find((t) => t.turnId === turnId && t.seat === seat);
    if (!meta || !step || !turn || turn.action !== undefined) return { status: "stale" };
    if (call) {
      const v = this.ruleset(meta).validate(this.rulesetState, seat, call);
      if (!v.ok) return { status: "invalid", error: v.error };
    }
    turn.action = call;
    this.step = step;
    if (stepComplete(step)) await this.ctx.storage.setAlarm(Date.now());
    return { status: "accepted" };
  }

  // ---- driving the Match ---------------------------------------------

  async alarm(): Promise<void> {
    const meta = this.meta;
    if (!meta || meta.status === "finished") return;
    const ruleset = this.ruleset(meta);

    const pending = this.step;
    if (pending) {
      if (!stepComplete(pending)) return; // Players will report; deadlines land here later.
      const r = ruleset.applyActions(this.rulesetState, actionsOf(pending));
      this.rulesetState = r.state;
      this.step = undefined;
      this.commit(r.events);
    }

    const next = ruleset.nextStep(this.rulesetState);
    if (next.type === "finished") {
      this.meta = { ...meta, status: "finished", result: next.result };
      await this.env.LEAGUE.getByName("default").reportMatchResult(meta.matchId, next.result);
      return;
    }
    await this.dispatch(meta, ruleset, next.turns);
  }

  /** Start a step: freeze each Player's observation and hand the turns to the Player DOs. */
  private async dispatch(meta: MatchMeta, ruleset: Ruleset<unknown>, turns: import("../core/ruleset").TurnRequest[]) {
    const state = this.rulesetState;
    const all = this.events();
    const head = this.lastSeq();
    const stepNo = meta.stepCount + 1;
    const lastSeen = { ...meta.lastSeen };
    const step: PendingStep = {
      stepNo,
      startedAt: Date.now(),
      turns: turns.map((request) => {
        const seen = lastSeen[request.seat];
        const firstTurn = seen === undefined;
        const fresh = ruleset.view(
          all.filter((e) => e.seq > (seen ?? 0)),
          { seat: request.seat },
        );
        const observation = ruleset.renderObservation(state, request.seat, fresh, request);
        lastSeen[request.seat] = head;
        const text = firstTurn ? `${ruleset.briefing(state, request.seat)}\n\n${observation}` : observation;
        return {
          turnId: `${meta.matchId}:${stepNo}:${request.seat}`,
          seat: request.seat,
          request,
          input: { text, turn: request, firstTurn },
        };
      }),
    };
    this.meta = { ...meta, stepCount: stepNo, lastSeen };
    this.step = step;
    await Promise.all(
      step.turns.map((t) => {
        const assignment: TurnAssignment = { matchId: meta.matchId, turnId: t.turnId, seat: t.seat, input: t.input };
        return this.env.PLAYER.getByName(`${meta.matchId}:${t.seat}`).takeTurn(assignment);
      }),
    );
  }

  // ---- Spectator WebSocket --------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const meta = this.meta;
    if (!meta) return new Response("no such match", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Subscribe and send the full log in one synchronous step, so a Spectator
    // neither misses nor duplicates an event.
    this.ctx.acceptWebSocket(server);
    const log: ServerMessage = { type: "log", matchId: meta.matchId, events: this.events() };
    server.send(JSON.stringify(log));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // Spectators never act in a Match.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      // already closed
    }
  }
}
