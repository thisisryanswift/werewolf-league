// Match DO: one per Match. Holds the seed, seats, Ruleset state and the
// append-only event log; drives the Ruleset, dispatches turns to Player DOs and
// broadcasts committed events to Spectators over hibernatable WebSockets.
// Ruleset-agnostic: it only talks to the Ruleset interface.

import { DurableObject } from "cloudflare:workers";
import {
  countTimeouts,
  expireOverdue,
  isRunnerEvent,
  nextMatchWake,
  resolveDeadlines,
  stepResolvedEvents,
  turnDuration,
  turnStartedEvents,
  type DeadlineConfig,
} from "../core/deadlines";
import {
  actionsOf,
  stepComplete,
  type MatchInit,
  type MatchReport,
  type MatchSnapshot,
  type MatchStatus,
  type PendingStep,
  type SubmitResult,
  type TurnAssignment,
} from "../core/match";
import { isNarrationEvent, latestDrama, LatestOnly, narrateMatch } from "../core/narrator";
import { LEAGUE_NAME } from "../core/roster";
import type { Ruleset, Seat, ToolCall, ToolSpec, TurnRequest } from "../core/ruleset";
import { narratorFor } from "../narrator";
import { getRuleset } from "../rulesets";
import type { MatchEvent, RulesetEvent, ServerMessage } from "../shared/protocol";
import { ratingsSettledEvent } from "../shared/turn-events";
import type { SettleAck } from "./league";

/** How soon the Match retries sending a turn to a Player DO that failed to accept it. */
const DISPATCH_RETRY_MS = 1000;

interface MatchMeta extends Omit<MatchInit, "deadlines"> {
  status: MatchStatus;
  result: MatchReport | null;
  deadlines: DeadlineConfig;
  tools: Record<Seat, ToolSpec[]>;
  stepCount: number;
  /** Highest seq each seat has been shown in an observation. */
  lastSeen: Record<Seat, number>;
  /** Seats that have been assigned a turn before; only a seat's first assignment gets the first-turn deadline. */
  assigned?: Seat[];
  /** True once the League has acknowledged the result. */
  resultAcked?: boolean;
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
    this.meta = {
      ...init,
      deadlines: resolveDeadlines(init.deadlines),
      status: "running",
      result: null,
      tools: setup.tools,
      stepCount: 0,
      lastSeen: {},
    };
    this.rulesetState = setup.state;
    this.commit(setup.events);
    this.pushSummary(ruleset);
    await this.ctx.storage.setAlarm(Date.now());
  }

  snapshot(): (MatchSnapshot & { events: MatchEvent[] }) | null {
    const meta = this.meta;
    if (!meta) return null;
    const events = this.events();
    return {
      matchId: meta.matchId,
      rulesetId: meta.rulesetId,
      status: meta.status,
      seats: meta.seats,
      result: meta.result,
      stats: { timeouts: countTimeouts(events, meta.seats) },
      events,
    };
  }

  /** A Player reports its turn's action (`null` = no valid action, use the default). */
  async submitAction(turnId: string, seat: Seat, call: ToolCall | null): Promise<SubmitResult> {
    const meta = this.meta;
    const step = this.step;
    const turn = step?.turns.find((t) => t.turnId === turnId && t.seat === seat);
    // Results are tied to a turn ID: anything for a resolved or old turn is dropped.
    if (!meta || !step || !turn || turn.action !== undefined) return { status: "stale" };
    if (Date.now() >= turn.deadlineAt) {
      // Too late, even if the backstop hasn't fired yet: the default applies instead.
      turn.action = null;
      turn.timedOut = "late";
      this.step = step;
      await this.armAlarm(meta, step);
      return { status: "stale" };
    }
    if (call) {
      const v = this.ruleset(meta).validate(this.rulesetState, seat, call);
      if (!v.ok) return { status: "invalid", error: v.error };
    }
    turn.action = call;
    this.step = step;
    await this.armAlarm(meta, step);
    return { status: "accepted" };
  }

  /** A Player reports that its turn missed the deadline; the Ruleset's default applies. */
  async reportTimeout(turnId: string, seat: Seat): Promise<SubmitResult> {
    const meta = this.meta;
    const step = this.step;
    const turn = step?.turns.find((t) => t.turnId === turnId && t.seat === seat);
    if (!meta || !step || !turn || turn.action !== undefined) return { status: "stale" };
    turn.action = null;
    turn.timedOut = "player";
    this.step = step;
    await this.armAlarm(meta, step);
    return { status: "accepted" };
  }

  /** Wake when the step can resolve, a dispatch needs retrying, or the backstop is due. */
  private armAlarm(meta: MatchMeta, step: PendingStep): Promise<void> {
    return this.ctx.storage.setAlarm(nextMatchWake(step, Date.now(), meta.deadlines.graceMs, DISPATCH_RETRY_MS));
  }

  // ---- driving the Match ---------------------------------------------

  async alarm(): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    if (meta.status === "finished") {
      if (!meta.resultAcked) await this.deliverResult(meta);
      return;
    }
    const ruleset = this.ruleset(meta);

    const pending = this.step;
    if (pending) {
      // Backstop: expire turns whose Player DO never reported by deadline + grace.
      if (expireOverdue(pending, Date.now(), meta.deadlines.graceMs)) this.step = pending;
      if (!stepComplete(pending)) {
        await this.sendTurns(meta, pending.stepNo);
        return;
      }
      this.resolve(meta, ruleset, pending);
      this.pushSummary(ruleset);
      this.narrate();
    }

    const current = this.meta!;
    const next = ruleset.nextStep(this.rulesetState);
    if (next.type === "finished") {
      const result: MatchReport = { ...next.result, timeouts: countTimeouts(this.events(), current.seats) };
      const done: MatchMeta = { ...current, status: "finished", result };
      this.meta = done;
      await this.deliverResult(done);
      return;
    }
    await this.dispatch(current, ruleset, next.turns);
  }

  /** Apply a complete step: record timeouts, advance each answering seat's lastSeen, commit the Ruleset's events. */
  private resolve(meta: MatchMeta, ruleset: Ruleset<unknown>, step: PendingStep): void {
    const r = ruleset.applyActions(this.rulesetState, actionsOf(step));
    // A seat that timed out never saw its observation, so its next turn repeats what it missed.
    const lastSeen = { ...meta.lastSeen };
    for (const t of step.turns) if (!t.timedOut) lastSeen[t.seat] = t.seenThrough;
    this.meta = { ...meta, lastSeen };
    this.rulesetState = r.state;
    this.step = undefined;
    this.commit([...stepResolvedEvents(step), ...r.events]);
  }

  /**
   * Deliver the result to the League until it acknowledges it. A retry alarm is
   * armed before each attempt, so a lost acknowledgement (or an eviction mid-call)
   * leads to redelivery; the League settles idempotently by Match ID.
   * Once finished the Match has no pending step, so no deadline or backstop
   * alarm competes with this one; the retry is the only wake-up it needs.
   */
  private async deliverResult(meta: MatchMeta): Promise<void> {
    if (!meta.result) return;
    await this.ctx.storage.setAlarm(Date.now() + Number(this.env.LEAGUE_RETRY_MS ?? 2000));
    let ack: SettleAck;
    try {
      ack = await this.env.LEAGUE.getByName(LEAGUE_NAME).reportMatchResult(meta.matchId, meta.result);
    } catch {
      return; // the armed alarm retries
    }
    const current = this.meta!;
    if (current.resultAcked) return; // a concurrent delivery already recorded the ack
    // The settlement's rating changes go into the log in the same synchronous step
    // as the ack, so the event is committed exactly once, with the League's deltas
    // (a redelivered result gets the original deltas back).
    const settled = ratingsSettledEvent(ack.settlement.ratings);
    if (settled) this.commit([settled]);
    this.meta = { ...current, resultAcked: true };
    await this.ctx.storage.deleteAlarm();
  }

  /** Push the public tile summary to the League. Best effort: never holds up the Match. */
  private pushSummary(ruleset: Ruleset<unknown>): void {
    const meta = this.meta;
    if (!meta) return;
    // Runner events (turn markers, step_resolved) and narrations are not game events.
    const events = this.events();
    const publicEvents = events.filter((e) => e.audience === "all" && !isRunnerEvent(e) && !isNarrationEvent(e));
    const summary = { ...ruleset.summary(this.rulesetState, publicEvents), ...latestDrama(events) };
    const update = this.env.LEAGUE.getByName(LEAGUE_NAME)
      .updateTile(meta.matchId, summary, this.lastSeq())
      .catch(() => {});
    this.ctx.waitUntil(update);
  }

  // ---- Narrator (never affects play) -------------------------------

  /** At most one narration in flight; a newer step supersedes any queued behind it. In memory only. */
  private narration: LatestOnly | null = null;

  /** Narrate the Match after a published step. Never awaited: it cannot delay or block a step. */
  private narrate(): void {
    const meta = this.meta;
    if (!meta?.narrator || !this.ruleset(meta).narration) return;
    this.narration ??= new LatestOnly(() => this.narrateOnce());
    const run = this.narration.kick();
    if (run) this.ctx.waitUntil(run);
  }

  /** One narration of the current log. A failure or timeout is dropped; the tile keeps its last value. */
  private async narrateOnce(): Promise<void> {
    const meta = this.meta!;
    const ruleset = this.ruleset(meta);
    const events = await narrateMatch({
      matchId: meta.matchId,
      config: meta.narrator!,
      narrator: narratorFor(meta.narrator!, this.env),
      hook: ruleset.narration!,
      state: this.rulesetState,
      events: this.events().filter((e) => !isRunnerEvent(e) && !isNarrationEvent(e)),
      throughSeq: this.lastSeq(),
    });
    this.commit(events);
    this.pushSummary(ruleset);
  }

  /** Start a step: freeze each Player's observation and hand the turns to the Player DOs. */
  private async dispatch(meta: MatchMeta, ruleset: Ruleset<unknown>, turns: TurnRequest[]) {
    const state = this.rulesetState;
    // Runner events (turn markers, timeouts) and narrations are for Spectators, never for Agents.
    const all = this.events().filter((e) => !isRunnerEvent(e) && !isNarrationEvent(e));
    const head = this.lastSeq();
    const stepNo = meta.stepCount + 1;
    const startedAt = Date.now();
    const assigned = new Set(meta.assigned ?? []);
    const step: PendingStep = {
      stepNo,
      startedAt,
      turns: turns.map((request) => {
        const seen = meta.lastSeen[request.seat];
        const firstTurn = seen === undefined;
        const fresh = ruleset.view(
          all.filter((e) => e.seq > (seen ?? 0)),
          { seat: request.seat },
        );
        const observation = ruleset.renderObservation(state, request.seat, fresh, request);
        const text = firstTurn ? `${ruleset.briefing(state, request.seat)}\n\n${observation}` : observation;
        // A seat whose first turn timed out is briefed again, but on the normal deadline.
        const deadlineMs = turnDuration(meta.deadlines, !assigned.has(request.seat));
        return {
          turnId: `${meta.matchId}:${stepNo}:${request.seat}`,
          seat: request.seat,
          request,
          input: { text, turn: request, firstTurn },
          deadlineMs,
          deadlineAt: startedAt + deadlineMs,
          seenThrough: head,
        };
      }),
    };
    this.meta = { ...meta, stepCount: stepNo, assigned: [...new Set([...assigned, ...turns.map((t) => t.seat)])] };
    this.step = step;
    this.commit(turnStartedEvents(step));
    await this.sendTurns(meta, stepNo);
  }

  /**
   * Hand every undispatched, unresolved turn of the step to its Player DO, then
   * arm the alarm. A Player DO ignores a turn it already holds, so re-sending is safe.
   */
  private async sendTurns(meta: MatchMeta, stepNo: number): Promise<void> {
    const step = this.step;
    if (!step || step.stepNo !== stepNo) return;
    const todo = step.turns.filter((t) => !t.dispatched && t.action === undefined);
    const sent = await Promise.allSettled(
      todo.map((t) => {
        const assignment: TurnAssignment = {
          matchId: meta.matchId,
          turnId: t.turnId,
          seat: t.seat,
          input: t.input,
          deadlineAt: t.deadlineAt,
        };
        return this.env.PLAYER.getByName(`${meta.matchId}:${t.seat}`).takeTurn(assignment);
      }),
    );
    // Players may have reported while we awaited: re-read before writing.
    const latest = this.step;
    if (!latest || latest.stepNo !== stepNo) return;
    todo.forEach((t, i) => {
      if (sent[i]!.status === "fulfilled") latest.turns.find((x) => x.turnId === t.turnId)!.dispatched = true;
    });
    this.step = latest;
    await this.armAlarm(meta, latest);
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
