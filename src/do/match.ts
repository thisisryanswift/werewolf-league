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
import { assembleInstructions } from "../core/agent-instructions";
import {
  ANALYST_PREAMBLE,
  ANALYST_SEAT,
  analysisEvent,
  analystAgent,
  DEFAULT_ANALYST_DEADLINE_MS,
  DEFAULT_ANALYST_MAX_WAIT_MS,
  REPORT_TOOL,
  reportOf,
  validateReport,
  type AnalysisEventData,
  type AnalysisFailure,
  type AnalysisReport,
} from "../core/analyst";
import type { AgentConfig } from "../core/harness";
import { isNarrationEvent, latestDrama, LatestOnly, narrateMatch } from "../core/narrator";
import { leagueIdOf, leagueStub } from "../core/leagues";
import type { Ruleset, Seat, ToolCall, ToolSpec, TurnRequest } from "../core/ruleset";
import { matchCost, type MatchUsage } from "../core/pricing";
import { atLeast, ledgerUsage, mergeModelUsage, recordReadings, type ModelUsage } from "../core/usage";
import { narratorFor } from "../narrator";
import { getRuleset } from "../rulesets";
import type { MatchCost, MatchEvent, RulesetEvent, ServerMessage, TileSummary } from "../shared/protocol";
import { matchCostEvent, notesUpdatedEvent, ratingsSettledEvent, thinkingSeats } from "../shared/turn-events";
import type { SettleAck } from "./league";

/**
 * A seat's Agent Instructions: the Ruleset-named sections of the Agent's own
 * instructions, or of the Ruleset's default text when the Agent has none.
 */
function seatInstructions(ruleset: Ruleset<unknown>, state: unknown, seat: Seat, agent: AgentConfig): string | undefined {
  const source = agent.instructions ?? ruleset.instructions?.source;
  if (!source) return undefined;
  return assembleInstructions(source, ruleset.instructions?.sections(state, seat) ?? []) || undefined;
}

/** Rounds of Player closes after the result before leftover usage is given up on. */
const MAX_CLOSE_ATTEMPTS = 5;

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
  /** Seats not yet closed after the Match finished (their leftover usage is still unread). */
  closePending?: Seat[];
  /** True while the League's settled cost is older than the result's (late usage); retried on the alarm. */
  costDirty?: boolean;
  /** Close rounds tried so far; closes still failing after MAX_CLOSE_ATTEMPTS are given up. */
  closeAttempts?: number;
  /** The post-Match Analyst's run, if this Match is analysed (see core/analyst.ts). */
  analysis?: AnalysisState;
}

/**
 * waiting: the result is final; waiting for the League's ack and an Analyst slot.
 * running: the Analyst's Player DO has the run. done: the analysis event is committed;
 * `released` once the League slot is freed, `closed` once the Analyst's leftovers are read.
 */
interface AnalysisState {
  status: "waiting" | "running" | "done";
  queuedAt: number;
  startedAt?: number;
  deadlineAt?: number;
  released?: boolean;
  closed?: boolean;
  /** True once the Analyst's Player DO has dropped (and cancelled) any turn still in flight. */
  abandoned?: boolean;
  abandonAttempts?: number;
}

/** The Analyst's single turn ID per Match. */
const analysisTurnId = (matchId: string) => `${matchId}:analysis`;

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

  /** Tokens billed so far: each seat's latest cumulative report, plus the Narrator's calls. */
  private get usage(): MatchUsage {
    return this.ctx.storage.kv.get<MatchUsage>("usage") ?? { bySeat: {}, narrator: {} };
  }
  private set usage(u: MatchUsage) {
    this.ctx.storage.kv.put("usage", u);
  }

  private cost(meta: MatchMeta): MatchCost {
    return matchCost(this.usage, meta.seats);
  }

  /**
   * Keep a seat's cumulative usage report unless an earlier one already counted more.
   * The Analyst's Player DO reports as ANALYST_SEAT. Returns true if it changed.
   */
  private recordSeatUsage(seat: Seat, reported: ModelUsage | undefined): boolean {
    if (!reported) return false;
    const u = this.usage;
    const current = seat === ANALYST_SEAT ? u.analyst : u.bySeat[seat];
    if (current && (!atLeast(reported, current) || JSON.stringify(current) === JSON.stringify(reported))) return false;
    this.usage = seat === ANALYST_SEAT ? { ...u, analyst: reported } : { ...u, bySeat: { ...u.bySeat, [seat]: reported } };
    return true;
  }

  /**
   * Usage that arrives after the Match finished (a late cancel or the last narration):
   * update the result, publish the new cost, and tell the League once it has settled.
   */
  private lateCost(): void {
    const meta = this.meta;
    if (!meta || meta.status !== "finished" || !meta.result) return;
    const cost = this.cost(meta);
    this.meta = { ...meta, result: { ...meta.result, cost } };
    this.commit([matchCostEvent(cost)]);
    if (meta.resultAcked) {
      this.meta = { ...this.meta!, costDirty: true };
      this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now()));
    }
  }

  /**
   * After the result: close every Player (so leftovers such as an unused setup
   * interaction are read and reported) and bring the League's settled cost up to
   * date. Each is retried on the alarm (closes at most MAX_CLOSE_ATTEMPTS times).
   */
  private async finishChores(): Promise<void> {
    const meta = this.meta!;
    const closing = meta.closePending ?? [];
    const dirty = !!meta.costDirty && !!meta.resultAcked;
    if (!closing.length && !dirty) return;
    await this.ctx.storage.setAlarm(Date.now() + Number(this.env.LEAGUE_RETRY_MS ?? 2000));
    const closed = await Promise.allSettled(closing.map((seat) => this.env.PLAYER.getByName(`${meta.matchId}:${seat}`).close()));
    const attempts = (meta.closeAttempts ?? 0) + 1;
    let failed = closing.filter((_, i) => closed[i]!.status === "rejected");
    if (failed.length && attempts >= MAX_CLOSE_ATTEMPTS) {
      console.warn(`Match ${meta.matchId}: gave up closing seats ${failed.join(", ")}; their leftover usage is not counted`);
      failed = [];
    }
    this.meta = { ...this.meta!, closePending: failed, closeAttempts: attempts };
    const latest = this.meta!;
    if (latest.costDirty && latest.resultAcked && latest.result?.cost) {
      const cost = latest.result.cost;
      const sent = await leagueStub(this.env, latest.league)
        .updateMatchCost(latest.matchId, cost)
        .then(() => true)
        .catch(() => false);
      // Clear only if no newer usage arrived while the update was in flight.
      if (sent && JSON.stringify(this.meta!.result?.cost) === JSON.stringify(cost)) this.meta = { ...this.meta!, costDirty: false };
    }
    const after = this.meta!;
    if (!after.closePending?.length && !(after.costDirty && after.resultAcked) && after.resultAcked) await this.ctx.storage.deleteAlarm();
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
          instructions: seatInstructions(ruleset, setup.state, s.seat, init.agents[s.seat]!),
          ...(init.league ? { league: init.league } : {}),
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
      ...(meta.matchNumber !== undefined ? { matchNumber: meta.matchNumber } : {}),
      league: leagueIdOf(meta.league),
      rulesetId: meta.rulesetId,
      status: meta.status,
      seats: meta.seats,
      result: meta.result,
      stats: { timeouts: countTimeouts(events, meta.seats), cost: this.cost(meta).total },
      events,
    };
  }

  /**
   * A Player reports its turn's action (`null` = no valid action, use the default),
   * with its cumulative usage, which counts even if the action is stale or invalid.
   */
  async submitAction(turnId: string, seat: Seat, call: ToolCall | null, usage?: ModelUsage, notes?: string): Promise<SubmitResult> {
    if (this.recordSeatUsage(seat, usage)) this.lateCost();
    if (seat === ANALYST_SEAT) return this.analysisReported(turnId, call);
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
    // Only a current, on-time turn's notes are published (a stale report never overwrites newer ones).
    // Before validation: an invalid call's notes are still the seat's latest.
    this.recordNotes(seat, notes);
    if (call) {
      const v = this.ruleset(meta).validate(this.rulesetState, seat, call);
      if (!v.ok) return { status: "invalid", error: v.error };
    }
    turn.action = call;
    this.step = step;
    await this.armAlarm(meta, step);
    return { status: "accepted" };
  }

  /**
   * Validate only: is `call` legal for this seat's open turn `turnId`? Records nothing (the
   * Player's submitAction does). Used by harnesses that check calls mid-run (pi).
   */
  async validateAction(turnId: string, seat: Seat, call: ToolCall): Promise<{ ok: true } | { ok: false; error: string }> {
    const meta = this.meta;
    const turn = this.step?.turns.find((t) => t.turnId === turnId && t.seat === seat);
    if (!meta || !turn || turn.action !== undefined || Date.now() >= turn.deadlineAt) {
      return { ok: false, error: "This turn is over; your call was not used." };
    }
    const v = this.ruleset(meta).validate(this.rulesetState, seat, call);
    return v.ok ? { ok: true } : { ok: false, error: v.error };
  }

  /**
   * Publish a seat's notes to Narrator's View if they changed (wl-rhpr). Best effort and
   * synchronous: anything unreadable is skipped, and it never fails or delays the turn.
   */
  private recordNotes(seat: Seat, notes: unknown): void {
    try {
      if (typeof notes !== "string" || !this.meta) return;
      const last = this.ctx.storage.kv.get<Record<string, string>>("notes") ?? {};
      if (last[seat] === notes) return;
      this.ctx.storage.kv.put("notes", { ...last, [seat]: notes });
      this.commit([notesUpdatedEvent(seat, notes)]);
    } catch (err) {
      console.warn(`Match ${this.meta?.matchId}: seat ${seat}'s notes were not published: ${String(err)}`);
    }
  }

  /** A Player reports that its turn missed the deadline; the Ruleset's default applies. */
  async reportTimeout(turnId: string, seat: Seat, usage?: ModelUsage): Promise<SubmitResult> {
    if (this.recordSeatUsage(seat, usage)) this.lateCost();
    if (seat === ANALYST_SEAT) {
      if (!this.analysisRunning(turnId)) return { status: "stale" };
      await this.finishAnalysis({ status: "failed", reason: "timeout" });
      return { status: "accepted" };
    }
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

  /** A Player reports its cumulative usage outside a turn report (e.g. after cancelling a superseded turn). */
  async recordUsage(seat: Seat, usage: ModelUsage): Promise<void> {
    if (this.recordSeatUsage(seat, usage)) this.lateCost();
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
      await this.finishChores();
      await this.analysisChores();
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
      this.narrate();
    }

    const current = this.meta!;
    const next = ruleset.nextStep(this.rulesetState);
    if (next.type === "finished") {
      const cost = this.cost(current);
      if (cost.unpriced.length) console.warn(`Match ${current.matchId}: no price for ${cost.unpriced.join(", ")}; counted at $0`);
      const result: MatchReport = { ...next.result, timeouts: countTimeouts(this.events(), current.seats), cost };
      const analysed = !!current.analyst && !!ruleset.analysis;
      const done: MatchMeta = {
        ...current,
        status: "finished",
        result,
        closePending: current.seats.map((s) => s.seat),
        ...(analysed ? { analysis: { status: "waiting", queuedAt: Date.now() } } : {}),
      };
      this.meta = done;
      this.commit([matchCostEvent(cost)]);
      this.pushSummary(ruleset);
      await this.deliverResult(done);
      await this.finishChores();
      await this.analysisChores();
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
      ack = await leagueStub(this.env, meta.league).reportMatchResult(meta.matchId, meta.result);
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
    // Usage that arrived while the result was in flight: the League settled the older cost.
    const cost = current.result?.cost;
    if (cost && JSON.stringify(cost) !== JSON.stringify(ack.settlement.result.cost)) this.meta = { ...this.meta!, costDirty: true };
    await this.ctx.storage.deleteAlarm(); // finishChores re-arms it if anything is left
  }

  /** Push the public tile summary to the League. Best effort: never holds up the Match. */
  private pushSummary(ruleset: Ruleset<unknown>): void {
    const meta = this.meta;
    if (!meta) return;
    // Runner events (turn markers, step_resolved) and narrations are not game events.
    const events = this.events();
    const publicEvents = events.filter((e) => e.audience === "all" && !isRunnerEvent(e) && !isNarrationEvent(e));
    const summary: TileSummary = {
      ...ruleset.summary(this.rulesetState, publicEvents),
      ...latestDrama(events),
      // Counts only: the runner's turn events are seat-private, so naming seats could reveal roles.
      thinking: thinkingSeats(events).length,
      timeouts: events.filter((e) => e.kind === "turn_timed_out").length,
      // Measured USD so far (Players and Narrator); only the total, so it never hints at roles.
      cost: this.cost(meta).total,
    };
    const update = leagueStub(this.env, meta.league)
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
    const { events, usage } = await narrateMatch({
      matchId: meta.matchId,
      config: meta.narrator!,
      narrator: narratorFor(meta.narrator!, this.env),
      hook: ruleset.narration!,
      state: this.rulesetState,
      events: this.events().filter((e) => !isRunnerEvent(e) && !isNarrationEvent(e)),
      throughSeq: this.lastSeq(),
    });
    if (usage.length) {
      // Each Narrator call is billed once; its usage is never re-read.
      const u = this.usage;
      this.usage = { ...u, narrator: mergeModelUsage(u.narrator, ledgerUsage(recordReadings({}, usage))) };
    }
    this.commit(events);
    if (usage.length) this.lateCost();
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
    // One push per step, once its turns are marked: the League coalesces these for the grid.
    this.pushSummary(ruleset);
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

  // ---- Analyst (after the result; never affects play or ratings) ----------

  private get analystDeadlineMs(): number {
    return this.meta?.analyst?.deadlineMs ?? DEFAULT_ANALYST_DEADLINE_MS;
  }

  /** A League slot's lease: the run's deadline and grace plus a margin (renewed once the run starts). */
  private get analystLeaseMs(): number {
    return this.analystDeadlineMs + (this.meta?.deadlines.graceMs ?? 0) + 60_000;
  }

  /** Arm the alarm for `at` unless it is already due sooner. */
  private async wakeBy(at: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current) await this.ctx.storage.setAlarm(at);
  }

  /**
   * Drive the Analyst's run on the finished Match's alarm (always after the result's
   * own chores, so their alarm handling can't drop its wake): take a League slot,
   * start the run, enforce its backstop, then free the slot and read leftover usage.
   */
  private async analysisChores(): Promise<void> {
    const meta = this.meta!;
    const a = meta.analysis;
    if (!a || !meta.resultAcked) return;
    const retryMs = Number(this.env.LEAGUE_RETRY_MS ?? 2000);
    const now = Date.now();
    const graceMs = meta.deadlines.graceMs;
    if (a.status === "waiting") {
      if (now - a.queuedAt > (meta.analyst?.maxWaitMs ?? DEFAULT_ANALYST_MAX_WAIT_MS)) {
        return this.finishAnalysis({ status: "failed", reason: "no_slot", detail: "waited too long for an Analyst slot" });
      }
      const lease = this.analystLeaseMs;
      const slot = await leagueStub(this.env, meta.league)
        .acquireAnalystSlot(meta.matchId, lease)
        .catch(() => "wait" as const);
      if (this.meta!.analysis?.status !== "waiting") return;
      if (slot === "spend_cap") return this.finishAnalysis({ status: "failed", reason: "spend_cap", detail: "the League reached its spend cap" });
      if (slot === "wait") return this.wakeBy(Date.now() + retryMs * 5);
      return this.startAnalysis();
    }
    if (a.status === "running") {
      // Backstop: the Analyst's Player DO never reported by deadline + grace.
      if (now >= a.deadlineAt! + graceMs) return this.finishAnalysis({ status: "failed", reason: "timeout", detail: "backstop" });
      return this.wakeBy(a.deadlineAt! + graceMs);
    }
    if (!a.abandoned && (a.abandonAttempts ?? 0) < MAX_CLOSE_ATTEMPTS) {
      // Stop a run still in flight (e.g. after the backstop) before its slot is freed, so the cap holds.
      const stopped = await this.env.PLAYER.getByName(`${meta.matchId}:${ANALYST_SEAT}`)
        .abandon()
        .then(() => true)
        .catch(() => false);
      const cur = this.meta!.analysis!;
      this.meta = { ...this.meta!, analysis: { ...cur, abandoned: stopped, abandonAttempts: (cur.abandonAttempts ?? 0) + 1 } };
      if (!stopped) return this.wakeBy(Date.now() + retryMs);
    }
    if (!this.meta!.analysis!.released) {
      const freed = await leagueStub(this.env, meta.league)
        .releaseAnalystSlot(meta.matchId)
        .then(() => true)
        .catch(() => false);
      // A slot never freed expires with its lease.
      if (freed) this.meta = { ...this.meta!, analysis: { ...this.meta!.analysis!, released: true } };
      else return this.wakeBy(Date.now() + retryMs);
    }
    if (!this.meta!.analysis!.closed) {
      // Once, best effort: read usage still unread (e.g. a cancelled run's); it reports through recordUsage.
      this.meta = { ...this.meta!, analysis: { ...this.meta!.analysis!, closed: true } };
      await this.env.PLAYER.getByName(`${meta.matchId}:${ANALYST_SEAT}`)
        .close()
        .catch(() => {});
    }
  }

  /** Hand the run to the Analyst's Player DO: its Agent Instructions mounted, the whole Match as input. */
  private async startAnalysis(): Promise<void> {
    const meta = this.meta!;
    const ruleset = this.ruleset(meta);
    const hook = ruleset.analysis!;
    const events = this.events().filter((e) => !isRunnerEvent(e) && !isNarrationEvent(e));
    const input = hook.input(this.rulesetState, events, { timeouts: countTimeouts(this.events(), meta.seats).bySeat });
    const agent = analystAgent(meta.analyst!);
    const player = this.env.PLAYER.getByName(`${meta.matchId}:${ANALYST_SEAT}`);
    try {
      await player.provision({
        matchId: meta.matchId,
        seat: ANALYST_SEAT,
        agent,
        tools: [REPORT_TOOL],
        instructions: assembleInstructions(hook.instructions.source, hook.instructions.sections),
        preamble: ANALYST_PREAMBLE,
        ...(meta.league ? { league: meta.league } : {}),
      });
    } catch (err) {
      return this.finishAnalysis({ status: "failed", reason: "provision_failed", detail: String(err).slice(0, 300) });
    }
    const startedAt = Date.now();
    const deadlineAt = startedAt + this.analystDeadlineMs;
    // Persisted before the turn is handed over, so a fast report finds the run.
    this.meta = { ...this.meta!, analysis: { ...this.meta!.analysis!, status: "running", startedAt, deadlineAt } };
    await this.wakeBy(deadlineAt + meta.deadlines.graceMs);
    // Renew the lease from now, so slow provisioning never lets it lapse mid-run (best effort).
    await leagueStub(this.env, meta.league)
      .acquireAnalystSlot(meta.matchId, this.analystLeaseMs)
      .catch(() => {});
    try {
      await player.takeTurn({
        matchId: meta.matchId,
        turnId: analysisTurnId(meta.matchId),
        seat: ANALYST_SEAT,
        input: {
          text: input,
          turn: { seat: ANALYST_SEAT, actionKind: REPORT_TOOL.name, legalTargets: [], prompt: "Call submit_report exactly once with your analysis." },
          firstTurn: true,
        },
        deadlineAt,
      });
    } catch (err) {
      await this.finishAnalysis({ status: "failed", reason: "provision_failed", detail: String(err).slice(0, 300) });
    }
  }

  private analysisRunning(turnId: string): boolean {
    const meta = this.meta;
    return meta?.analysis?.status === "running" && turnId === analysisTurnId(meta.matchId);
  }

  /** The Analyst's Player DO reports its call (null: the run ended without one). */
  private async analysisReported(turnId: string, call: ToolCall | null): Promise<SubmitResult> {
    const meta = this.meta;
    if (!meta || !this.analysisRunning(turnId)) return { status: "stale" };
    if (Date.now() >= meta.analysis!.deadlineAt!) {
      await this.finishAnalysis({ status: "failed", reason: "timeout", detail: "report arrived after the deadline" });
      return { status: "stale" };
    }
    if (!call) {
      await this.finishAnalysis({ status: "failed", reason: "no_report" });
      return { status: "accepted" };
    }
    const v = validateReport(call, meta.seats.map((s) => s.seat));
    if (!v.ok) return { status: "invalid", error: v.error };
    await this.finishAnalysis({ status: "ok", report: reportOf(call.args) });
    return { status: "accepted" };
  }

  /** Commit the one analysis event (a report or a recorded failure), then free the slot on the alarm. */
  private async finishAnalysis(
    outcome: { status: "ok"; report: AnalysisReport } | { status: "failed"; reason: AnalysisFailure; detail?: string },
  ): Promise<void> {
    const meta = this.meta!;
    const a = meta.analysis;
    if (!a || a.status === "done") return;
    const base = { model: analystAgent(meta.analyst!).model!, finishedAt: Date.now() };
    const data: AnalysisEventData =
      outcome.status === "ok"
        ? { ...base, status: "ok", startedAt: a.startedAt!, report: outcome.report }
        : { ...base, status: "failed", startedAt: a.startedAt ?? null, reason: outcome.reason, ...(outcome.detail ? { detail: outcome.detail } : {}) };
    this.meta = { ...meta, analysis: { ...a, status: "done" } };
    this.commit([analysisEvent(data)]);
    await this.wakeBy(Date.now());
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
    const log: ServerMessage = {
      type: "log",
      matchId: meta.matchId,
      ...(meta.matchNumber !== undefined ? { matchNumber: meta.matchNumber } : {}),
      events: this.events(),
    };
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
