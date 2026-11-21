// League DO (one for the demo). Keeps N Matches live, drawing each table from
// the roster with a recorded match seed; settles each finished Match exactly
// once (idempotent by Match ID) and starts its replacement; serves the grid
// feed over a hibernatable WebSocket. Ruleset-agnostic: it only uses the
// Ruleset interface (to check a drawn table can be dealt).

import { DurableObject } from "cloudflare:workers";
import { drawTable } from "../core/draw";
import type { MatchInit, MatchReport } from "../core/match";
import { FeedCoalescer } from "../core/league-feed";
import { defaultLeagueConfig, patchConfig, type LeagueConfig } from "../core/roster";
import { applyMatch, calibrationByAgent, rankStandings, ratePlayers, snapshotOf, standing, type AgentRecord, type RatingSnapshot } from "../core/ratings";
import { buildMatchInit } from "../core/start-match";
import { backoffUntil, recentStarts, startBudget } from "../core/start-pacer";
import { getRuleset } from "../rulesets";
import type {
  FeaturedMatch,
  Leaderboard,
  LeagueMessage,
  LeagueSnapshot,
  MatchTile,
  RateLimitEvent,
  RatingChanges,
  SettledMatch,
  TileSeat,
  TileSummary,
} from "../shared/protocol";

/** A live League Match: its tile plus what is needed to (re)start it. */
interface LiveMatch extends MatchTile {
  init: MatchInit;
  /** Seq of the event the current summary reflects; older summaries are ignored. */
  summarySeq: number;
  startFailures: number;
  /** The seated Agents' Side Ratings when the table was drawn: every Player is rated from this. */
  ratingsBefore?: RatingSnapshot;
}

/**
 * The permanent record of a settled Match, keyed by Match ID. A duplicate result
 * returns this record unchanged. Rating changes (wl-lvtw) belong here, so a
 * retried result returns the original deltas without applying them again.
 */
export interface Settlement {
  matchId: string;
  /** The Match's result as reported, including timeout counts. */
  result: MatchReport;
  /** Seats of a League-scheduled Match; null for a Match the League did not start. */
  seats: TileSeat[] | null;
  settledAt: number;
  /** Rating changes applied by this settlement; null for a Match the League did not start (unrated). */
  ratings: RatingChanges | null;
}

export interface SettleAck {
  ok: true;
  /** True if this Match had already been settled; nothing was applied again. */
  duplicate: boolean;
  settlement: Settlement;
}

const MAX_START_FAILURES = 3;
const RECENT = 12;
/** 429 reports kept on the League snapshot. */
const RATE_LIMIT_EVENTS = 10;

/** 429 backoff state: no new Matches start before `until`. */
interface RateLimitState {
  until: number;
  count: number;
  recent: RateLimitEvent[];
}

export class LeagueDO extends DurableObject<Env> {
  /** The League's clock for start pacing and backoff. Tests replace it to drive time. */
  now(): number {
    return Date.now();
  }

  /** Coalesces every change into at most one feed message per feed interval. */
  private feed = new FeedCoalescer({
    intervalMs: () => this.config.feedIntervalMs,
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    snapshot: () => this.snapshot(),
    send: (msg) => this.send(msg),
    nextRev: () => {
      const rev = (this.ctx.storage.kv.get<number>("feedRev") ?? 0) + 1;
      this.ctx.storage.kv.put("feedRev", rev);
      return rev;
    },
  });

  // ---- storage ---------------------------------------------------------

  private get config(): LeagueConfig {
    // Stored configs from before a key existed get its default.
    return { ...defaultLeagueConfig(), ...this.ctx.storage.kv.get<LeagueConfig>("config") };
  }
  private set config(c: LeagueConfig) {
    this.ctx.storage.kv.put("config", c);
  }
  private get live(): Record<string, LiveMatch> {
    return this.ctx.storage.kv.get<Record<string, LiveMatch>>("live") ?? {};
  }
  private set live(l: Record<string, LiveMatch>) {
    this.ctx.storage.kv.put("live", l);
  }
  private get stats(): { started: number; settled: number } {
    return this.ctx.storage.kv.get("stats") ?? { started: 0, settled: 0 };
  }
  private set stats(s: { started: number; settled: number }) {
    this.ctx.storage.kv.put("stats", s);
  }
  private get recent(): SettledMatch[] {
    return this.ctx.storage.kv.get<SettledMatch[]>("recent") ?? [];
  }
  /** Per-Agent ratings and counts, keyed by Agent ID. */
  private get agents(): Record<string, AgentRecord> {
    return this.ctx.storage.kv.get<Record<string, AgentRecord>>("agents") ?? {};
  }
  private set agents(a: Record<string, AgentRecord>) {
    this.ctx.storage.kv.put("agents", a);
  }
  /** The operator-pinned featured Match, if any. */
  private get pinned(): SettledMatch | null {
    return this.ctx.storage.kv.get<SettledMatch>("featured") ?? null;
  }
  private get featured(): FeaturedMatch | null {
    const pinned = this.pinned;
    if (pinned) return { ...pinned, pinned: true };
    const latest = this.recent[0];
    return latest ? { ...latest, pinned: false } : null;
  }
  private get blocked(): string | null {
    return this.ctx.storage.kv.get<string>("blocked") ?? null;
  }
  private set blocked(b: string | null) {
    if (b) this.ctx.storage.kv.put("blocked", b);
    else this.ctx.storage.kv.delete("blocked");
  }

  /** Pacer start times (League clock) still inside the start window. */
  private get starts(): number[] {
    return this.ctx.storage.kv.get<number[]>("starts") ?? [];
  }
  private set starts(s: number[]) {
    this.ctx.storage.kv.put("starts", s);
  }
  private get rateLimit(): RateLimitState {
    return this.ctx.storage.kv.get<RateLimitState>("rateLimit") ?? { until: 0, count: 0, recent: [] };
  }
  private set rateLimit(r: RateLimitState) {
    this.ctx.storage.kv.put("rateLimit", r);
  }

  private get retryMs(): number {
    return Number(this.env.LEAGUE_RETRY_MS ?? 2000);
  }

  // ---- snapshot and feed ------------------------------------------------

  snapshot(): LeagueSnapshot {
    const c = this.config;
    return {
      config: {
        n: c.n,
        paused: c.paused,
        seats: c.seats,
        rulesetId: c.rulesetId,
        startsPerWindow: c.startsPerWindow,
        startWindowMs: c.startWindowMs,
        backoffMs: c.backoffMs,
        feedIntervalMs: c.feedIntervalMs,
        roster: c.roster.map(({ id, name, harness, model }) => ({ id, name, harness, ...(model ? { model } : {}) })),
      },
      tiles: Object.values(this.live)
        .sort((a, b) => a.startedAt - b.startedAt)
        .map(({ matchId, seed, status, seats, summary, startedAt }) => ({ matchId, seed, status, seats, summary, startedAt })),
      recent: this.recent,
      featured: this.featured,
      stats: this.stats,
      blocked: this.blocked,
      rateLimit: this.rateLimitView(),
      leaderboard: this.leaderboard(),
    };
  }

  private rateLimitView(): LeagueSnapshot["rateLimit"] {
    const r = this.rateLimit;
    return { backoffUntil: r.until > this.now() ? r.until : null, count: r.count, recent: r.recent };
  }

  /** Every current roster Agent plus every Agent with a rated Match, ranked by Overall Rating. */
  private leaderboard(): Leaderboard {
    const c = this.config;
    const sides = [...getRuleset(c.rulesetId).sides];
    const records = this.agents;
    const names = new Map<string, string>(Object.entries(records).map(([id, r]) => [id, r.name]));
    for (const a of c.roster) names.set(a.id, a.name);
    return { sides, rows: rankStandings([...names].map(([id, name]) => standing(id, name, records[id], sides))) };
  }

  /** Push the leaderboard after a rated Match settles, as its own feed message. */
  private broadcastLeaderboard(matchId: string): void {
    this.send({ type: "leaderboard", matchId, leaderboard: this.leaderboard() });
  }

  /** Something on the snapshot changed: grid clients get it in the next coalesced feed message. */
  private broadcast(): void {
    this.feed.changed();
  }

  private send(msg: LeagueMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // Closed socket; the runtime drops it.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Subscribe and send the snapshot in one synchronous step.
    this.ctx.acceptWebSocket(server);
    const msg: LeagueMessage = { type: "league", league: this.snapshot() };
    server.send(JSON.stringify(msg));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(): Promise<void> {
    // Spectators never change the League.
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 ? 1000 : code, "closing");
    } catch {
      // already closed
    }
  }

  // ---- admin operations (the Worker checks the shared secret) -------------

  async pause(): Promise<LeagueSnapshot> {
    this.config = { ...this.config, paused: true };
    this.broadcast();
    return this.snapshot();
  }

  async resume(): Promise<LeagueSnapshot> {
    this.config = { ...this.config, paused: false };
    await this.schedule();
    return this.snapshot();
  }

  /** Set N, the roster, seats per Match or Ruleset config. Lowering N lets running Matches finish. */
  async configure(patch: Record<string, unknown>): Promise<{ ok: true; league: LeagueSnapshot } | { ok: false; error: string }> {
    const r = patchConfig(this.config, patch);
    if (!r.ok) return r;
    this.config = r.config;
    this.blocked = null;
    await this.schedule();
    return { ok: true, league: this.snapshot() };
  }

  /**
   * Pin a finished Match (League or one-off) as the featured Match, or clear
   * the pin with null so the most recent finished Match is featured.
   */
  async setFeatured(matchId: string | null): Promise<{ ok: true; league: LeagueSnapshot } | { ok: false; error: string }> {
    if (matchId === null) {
      this.ctx.storage.kv.delete("featured");
    } else {
      const s = this.ctx.storage.kv.get<Settlement>(`settled:${matchId}`);
      if (!s) return { ok: false, error: `Match ${matchId} has not finished` };
      const pinned: SettledMatch = { matchId, winner: s.result.winner, settledAt: s.settledAt };
      this.ctx.storage.kv.put("featured", pinned);
    }
    this.broadcast();
    return { ok: true, league: this.snapshot() };
  }

  // ---- from Match DOs ----------------------------------------------------

  /** A Match's latest public summary for its tile. Stale or unknown updates are ignored. */
  async updateTile(matchId: string, summary: TileSummary, seq: number): Promise<void> {
    const live = this.live;
    const m = live[matchId];
    if (!m || seq < m.summarySeq) return;
    live[matchId] = { ...m, status: "running", summary, summarySeq: seq };
    this.live = live;
    this.broadcast();
  }

  /**
   * A Player's model API call was refused with a 429: start no new Matches for
   * the backoff period (extended by each report) and record the event.
   */
  async reportRateLimit(report: Omit<RateLimitEvent, "at">): Promise<void> {
    const now = this.now();
    const r = this.rateLimit;
    this.rateLimit = {
      until: backoffUntil(r.until, now, this.config.backoffMs),
      count: r.count + 1,
      recent: [{ ...report, at: now }, ...r.recent].slice(0, RATE_LIMIT_EVENTS),
    };
    this.broadcast();
    await this.armWake();
  }

  /**
   * Settle a finished Match. Idempotent by Match ID: the Match retries until it
   * gets an ack, and a duplicate returns the original settlement and starts no
   * second replacement. Everything up to the ack is synchronous, so a
   * settlement and its replacement reservation commit together.
   */
  async reportMatchResult(matchId: string, result: MatchReport): Promise<SettleAck> {
    const existing = this.ctx.storage.kv.get<Settlement>(`settled:${matchId}`);
    if (existing) return { ok: true, duplicate: true, settlement: existing };

    const live = this.live;
    const entry = live[matchId];
    const settlement = this.settle({ matchId, result, seats: entry?.seats ?? null, settledAt: Date.now(), ratings: null }, entry);
    this.ctx.storage.kv.put(`settled:${matchId}`, settlement);
    if (settlement.ratings) this.broadcastLeaderboard(matchId);
    if (entry) {
      delete live[matchId];
      this.live = live;
      this.stats = { ...this.stats, settled: this.stats.settled + 1 };
      const recent = [{ matchId, winner: result.winner, settledAt: settlement.settledAt }, ...this.recent].slice(0, RECENT);
      this.ctx.storage.kv.put("recent", recent);
    }
    await this.schedule();
    return { ok: true, duplicate: false, settlement };
  }

  /**
   * Settlement hook: runs exactly once per Match ID, synchronously, before the
   * settlement record is stored. Applies the Match's rating changes, computed
   * from the pre-Match snapshot, to the current ratings and returns them on the
   * record. Only League-scheduled Matches are rated.
   */
  private settle(s: Settlement, entry: LiveMatch | undefined): Settlement {
    if (!entry) return s;
    const records = this.agents;
    const seats = entry.seats;
    const snapshot = entry.ratingsBefore ?? snapshotOf(records, seats.map((x) => x.agentId));
    const players = ratePlayers({ seats, sides: s.result.sides, winner: s.result.winner, snapshot });
    const names = Object.fromEntries(Object.values(entry.init.agents).map((a) => [a.id, a.name]));
    const applied = applyMatch({
      records,
      players,
      winner: s.result.winner,
      sideOrder: getRuleset(entry.init.rulesetId).sides,
      names,
      timeoutsByAgent: s.result.timeouts?.byAgent ?? {},
      calibrationByAgent: calibrationByAgent(seats, s.result),
    });
    this.agents = applied.records;
    return { ...s, ratings: applied.changes };
  }

  // ---- scheduling ----------------------------------------------------------

  /** Reserve replacement slots (synchronously), broadcast, and start them on the alarm. */
  private async schedule(): Promise<void> {
    this.reserve();
    this.broadcast();
    await this.armWake();
  }

  /**
   * Arm the alarm for the earliest thing the League waits for: starting reserved
   * Matches (now, after a retry delay, or when the backoff ends), or the next
   * start slot while below N. Never pushes an earlier alarm later.
   */
  private async armWake(retry = false): Promise<void> {
    const now = this.now();
    const config = this.config;
    const live = Object.values(this.live);
    const until = this.rateLimit.until;
    const wakes: number[] = [];
    // After a failed start (whose slot may have been freed), try again after the retry delay.
    if (retry) wakes.push(Math.max(now + this.retryMs, until));
    else if (live.some((m) => m.status === "starting")) wakes.push(Math.max(now, until));
    if (!config.paused && live.length < config.n) {
      const { nextAt } = startBudget(this.starts, now, config, until);
      if (nextAt !== null) wakes.push(nextAt);
    }
    if (!wakes.length) return;
    // The League clock may differ from the runtime's (tests): arm by relative delay.
    const at = Date.now() + Math.max(0, Math.min(...wakes) - now);
    const current = await this.ctx.storage.getAlarm();
    if (current === null || at < current) await this.ctx.storage.setAlarm(at);
  }

  /**
   * Fill free slots up to N with newly drawn tables, as far as start pacing and
   * any 429 backoff allow. Synchronous, so two concurrent callers can never
   * over-fill. Each table is drawn from a new match seed; a table the Ruleset
   * can't deal is redrawn from the same seed.
   */
  private reserve(): void {
    const config = this.config;
    if (config.paused) return;
    const live = this.live;
    const ruleset = getRuleset(config.rulesetId);
    const records = this.agents;
    const seeds = [...(config.seeds ?? [])];
    const now = this.now();
    const starts = recentStarts(this.starts, now, config);
    const { allowed } = startBudget(starts, now, config, this.rateLimit.until);
    let started = 0;
    while (Object.keys(live).length < config.n && started < allowed) {
      const seed = seeds.shift() ?? crypto.randomUUID();
      const draw = drawTable({
        roster: config.roster,
        seats: config.seats,
        seed,
        check: (seats) => {
          const r = ruleset.setup(config.rulesetConfig, seed, seats);
          return r.ok ? null : r.error;
        },
      });
      if (!draw.ok) {
        this.blocked = draw.error;
        break;
      }
      const init = buildMatchInit({
        seed,
        rulesetId: config.rulesetId,
        config: config.rulesetConfig,
        deadlines: config.deadlines,
        narrator: config.narrator,
        agents: draw.agents,
      });
      live[init.matchId] = {
        matchId: init.matchId,
        seed,
        status: "starting",
        seats: init.seats,
        summary: null,
        summarySeq: 0,
        startedAt: Date.now(),
        init,
        startFailures: 0,
        ratingsBefore: snapshotOf(records, init.seats.map((x) => x.agentId)),
      };
      started++;
    }
    if (seeds.length !== (config.seeds ?? []).length) this.config = { ...config, seeds };
    if (started) {
      this.live = live;
      this.stats = { ...this.stats, started: this.stats.started + started };
      this.starts = [...starts, ...Array<number>(started).fill(now)];
    }
  }

  /** Start reserved Matches. A start that fails is retried; after repeated failures its slot is freed. */
  async alarm(): Promise<void> {
    this.reserve(); // refill freed slots as pacing allows
    if (this.now() < this.rateLimit.until) {
      // Backing off after a 429: hold reserved Matches until it ends.
      this.broadcast();
      return this.armWake();
    }
    const starting = Object.values(this.live).filter((m) => m.status === "starting");
    const outcomes = await Promise.all(
      starting.map((m) =>
        this.env.MATCH.getByName(m.matchId)
          .start(m.init)
          .then(() => null)
          .catch((err: unknown) => String(err)),
      ),
    );
    const live = this.live;
    let retry = false;
    starting.forEach((m, i) => {
      const cur = live[m.matchId];
      if (!cur) return; // settled meanwhile
      const error = outcomes[i];
      if (error === null) {
        if (cur.status === "starting") live[m.matchId] = { ...cur, status: "running" };
        this.blocked = null; // a start succeeded, so any earlier failure is resolved
        return;
      }
      const failures = cur.startFailures + 1;
      if (failures >= MAX_START_FAILURES) {
        delete live[m.matchId];
        this.blocked = `Match ${m.matchId} failed to start: ${error}`;
      } else {
        live[m.matchId] = { ...cur, startFailures: failures };
      }
      retry = true;
    });
    this.live = live;
    this.broadcast();
    await this.armWake(retry);
  }
}
