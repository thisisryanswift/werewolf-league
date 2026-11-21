// The Match view's model: everything a Spectator sees, derived from the event log
// and the God View setting. Pure and DOM-free, so it is tested directly.
//
// God View rule: an event is God-View-only when its audience is not "all". With
// God View off those events are dropped before anything else is derived, so no
// role, Wolf Chat, Night choice, turn marker or secret Drama Flag can leak.
import type { AgentRatingChange, MatchEvent } from "../../src/shared/protocol";
import { spectatorLabel } from "../../src/shared/seat-label";
import { countTimeouts, thinkingSeats, type MatchCostData } from "../../src/shared/turn-events";

export interface SeatInfo {
  seat: number;
  label: string;
  /** Absent in Matches recorded before Display Names. */
  displayName?: string;
  agentId: string;
}

/** How a seat is named everywhere in the Match view: "Mara · Hydrogen #2". */
export function playerLabel(s: SeatInfo): string {
  return spectatorLabel(s);
}

/** The Agent's name for a seat ("Hydrogen" for "Hydrogen #2"). */
export function agentName(s: SeatInfo): string {
  return s.label.replace(/ #\d+$/, "");
}

export interface SeatView extends SeatInfo {
  alive: boolean;
  /** Known role: always for the dead, and for everyone in God View. */
  role: string | null;
  /** The seat's latest Claim. */
  claim: ClaimView | null;
  /** A turn is in flight (God View only: who acts at Night would reveal roles). */
  thinking: boolean;
  /** Turns that missed their deadline (God View only). */
  timeouts: number;
}

export interface ClaimView {
  role: string;
  results: { seat: number; side: string }[];
  /** Whether the claimed role is the seat's real one; null while its role is hidden. */
  truth: "true" | "lie" | null;
}

export interface FeedItem {
  event: MatchEvent;
  godViewOnly: boolean;
}

export type FeedGroupKind = "setup" | "night" | "round" | "reply" | "vote" | "result";

export interface FeedGroup {
  key: string;
  kind: FeedGroupKind;
  title: string;
  items: FeedItem[];
  /** Vote groups only. */
  tally?: VoteTally;
}

export interface VoteTally {
  /** Targets with at least one vote, most votes first (seat order on ties); Abstain last. */
  counts: { target: number | "abstain"; votes: number }[];
  eliminated: number | null;
  outcome: "eliminated" | "tie" | "all_abstain" | "pending";
}

type Vote = { seat: number; target: number | "abstain"; reason: string | null; timedOut: boolean };

export interface EndScreen {
  winner: string;
  reason: string;
  roles: { seat: number; label: string; role: string; alive: boolean }[];
  /** Each Agent's rating change; null until `ratings_settled` arrives (never, for an unrated one-off Match). */
  ratings: (AgentRatingChange & { name: string })[] | null;
  /** Final measured cost in USD (the latest `match_cost` event); null if the Match reported none. */
  cost: EndCost | null;
}

export interface EndCost {
  /** Players plus Narrator. */
  total: number;
  narrator: number;
  /** Each Agent's share (the sum of its seats), in seat order of first appearance. */
  agents: { agentId: string; name: string; cost: number }[];
  tokens: { input: number; cached: number; thought: number; output: number };
}

export interface MatchView {
  seats: SeatView[];
  status: { phase: "night" | "day" | "over" | null; cycle: number; alive: number; total: number };
  feed: FeedGroup[];
  /** Null until the Match is over. */
  end: EndScreen | null;
  /** The latest Day's Accusations (Speech Rounds only), in log order; null before any. */
  accusations: { cycle: number; links: { from: number; to: number; round: string }[] } | null;
}

export const isGodViewOnly = (e: MatchEvent): boolean => e.audience !== "all";

/** The panels to show: God-View-only ones only while God View is on. */
export function panelsFor<P extends { godViewOnly: boolean }>(panels: readonly P[], godView: boolean): P[] {
  return panels.filter((p) => godView || !p.godViewOnly);
}

/** The events a Spectator may see. */
export function visibleEvents(events: MatchEvent[], godView: boolean): MatchEvent[] {
  return godView ? events : events.filter((e) => !isGodViewOnly(e));
}

const sideOfRole = (role: string) => (role === "werewolf" ? "wolf" : "village");

/**
 * A Claim is true only if the claimed role is the seat's real one and every claimed
 * result names that seat's true Side. Any known falsehood makes it a lie; otherwise
 * it is unjudged (null) while the claimer's role or a claimed seat's role is hidden.
 */
function claimTruth(claim: Omit<ClaimView, "truth">, role: string | null, roles: Map<number, string>): ClaimView["truth"] {
  if (role !== null && role !== claim.role) return "lie";
  let unknown = role === null;
  for (const r of claim.results) {
    const actual = roles.get(Number(r.seat));
    if (actual === undefined) unknown = true;
    else if (sideOfRole(actual) !== r.side) return "lie";
  }
  return unknown ? null : "true";
}

export function buildMatchView(events: MatchEvent[], opts: { godView: boolean }): MatchView {
  const log = visibleEvents(events, opts.godView);
  const setup = (log.find((e) => e.kind === "match_setup")?.data.seats ?? []) as SeatInfo[];
  const roles = new Map<number, string>();
  const dead = new Set<number>();
  for (const e of log) {
    if (e.kind === "role_assigned" || e.kind === "player_died") roles.set(Number(e.data.seat), String(e.data.role));
    if (e.kind === "player_died") dead.add(Number(e.data.seat));
    // The Match's end reveals every role publicly.
    if (e.kind === "match_over") for (const [seat, role] of Object.entries(e.data.roles ?? {})) roles.set(Number(seat), String(role));
  }
  const claims = new Map<number, Omit<ClaimView, "truth">>();
  for (const e of log) {
    const claim = e.kind === "speech" ? (e.data.claim as Omit<ClaimView, "truth"> | null) : null;
    if (claim) claims.set(Number(e.data.seat), { role: claim.role, results: claim.results ?? [] });
  }
  const thinking = new Set(thinkingSeats(log));
  const timeouts = countTimeouts(log, setup).bySeat;
  const seats = setup.map((s): SeatView => {
    const role = roles.get(s.seat) ?? null;
    const claim = claims.get(s.seat);
    return {
      ...s,
      alive: !dead.has(s.seat),
      role,
      claim: claim ? { ...claim, truth: claimTruth(claim, role, roles) } : null,
      thinking: thinking.has(s.seat),
      timeouts: timeouts[s.seat] ?? 0,
    };
  });
  let status: MatchView["status"] = { phase: null, cycle: 0, alive: seats.filter((s) => s.alive).length, total: seats.length };
  for (const e of log) {
    if (e.kind === "phase_started") status = { ...status, phase: e.data.phase as "night" | "day", cycle: Number(e.data.cycle) };
    if (e.kind === "match_over") status = { ...status, phase: "over" };
  }
  return { seats, status, feed: groupFeed(log), end: endScreen(log, seats), accusations: latestAccusations(log) };
}

function latestAccusations(log: MatchEvent[]): MatchView["accusations"] {
  const speeches = log.filter((e) => e.kind === "speech" && e.data.round !== "reply" && (e.data.accuse as number[]).length);
  const last = speeches.at(-1);
  if (!last) return null;
  const cycle = Number(last.data.cycle);
  const links = speeches
    .filter((e) => Number(e.data.cycle) === cycle)
    .flatMap((e) => (e.data.accuse as number[]).map((to) => ({ from: Number(e.data.seat), to, round: String(e.data.round) })));
  return { cycle, links };
}

function endScreen(log: MatchEvent[], seats: SeatView[]): EndScreen | null {
  const over = log.find((e) => e.kind === "match_over");
  if (!over) return null;
  const roles = (over.data.roles ?? {}) as Record<string, string>;
  const settled = log.find((e) => e.kind === "ratings_settled");
  const agents = (settled?.data.agents ?? null) as AgentRatingChange[] | null;
  const nameOf = (id: string) => {
    const s = seats.find((x) => x.agentId === id);
    return s ? agentName(s) : id;
  };
  return {
    winner: String(over.data.winner),
    reason: String(over.data.reason),
    roles: seats.map((s) => ({ seat: s.seat, label: playerLabel(s), role: roles[s.seat] ?? s.role ?? "?", alive: s.alive })),
    ratings: agents && agents.map((a) => ({ ...a, name: nameOf(a.agentId) })),
    cost: endCost(log, seats),
  };
}

function endCost(log: MatchEvent[], seats: SeatView[]): EndCost | null {
  const latest = log.filter((e) => e.kind === "match_cost").at(-1);
  if (!latest) return null;
  const d = latest.data as unknown as MatchCostData;
  const agents: EndCost["agents"] = [];
  for (const s of seats) {
    const usd = Number(d.bySeat?.[s.seat] ?? 0);
    const row = agents.find((a) => a.agentId === s.agentId);
    if (row) row.cost += usd;
    else agents.push({ agentId: s.agentId, name: agentName(s), cost: usd });
  }
  return { total: Number(d.total), narrator: Number(d.narrator ?? 0), agents, tokens: d.tokens };
}

/** Runner bookkeeping that is shown as seat markers (or on the end screen), never as feed lines. */
const MARKER_KINDS = new Set(["turn_started", "step_resolved", "match_cost"]);
const VOTE_KINDS = new Set(["votes_revealed", "beliefs_recorded", "no_elimination"]);
const RESULT_KINDS = new Set(["match_over", "ratings_settled"]);

/** Which group a Ruleset event belongs to, given the current phase; null keeps the current group. */
function groupFor(e: MatchEvent, phase: { phase: string; cycle: number } | null): Omit<FeedGroup, "items"> | null {
  const cycle = Number(e.data.cycle ?? phase?.cycle ?? 0);
  if (e.kind === "phase_started" && e.data.phase === "night") return { key: `night-${cycle}`, kind: "night", title: `Night ${cycle}` };
  if (e.kind === "phase_started") return null;
  if (RESULT_KINDS.has(e.kind)) return { key: "result", kind: "result", title: "Result" };
  if (!phase) return { key: "setup", kind: "setup", title: "Setup" };
  if (phase.phase !== "day") return null;
  if (e.kind === "speech" && e.data.round !== "reply") {
    return { key: `day-${cycle}-${e.data.round}`, kind: "round", title: `Day ${cycle} · Round ${String(e.data.round)}` };
  }
  if (e.kind === "speech" || e.kind === "replier_chosen" || e.kind === "no_right_of_reply") {
    return { key: `day-${cycle}-reply`, kind: "reply", title: `Day ${cycle} · Right of Reply` };
  }
  if (VOTE_KINDS.has(e.kind) || (e.kind === "player_died" && e.data.cause === "vote")) {
    return { key: `day-${cycle}-vote`, kind: "vote", title: `Day ${cycle} · Vote` };
  }
  return null;
}

function groupFeed(log: MatchEvent[]): FeedGroup[] {
  const groups: FeedGroup[] = [];
  let current: FeedGroup | null = null;
  let phase: { phase: string; cycle: number } | null = null;
  // A step's timeouts are committed just before its Ruleset events: hold them for that step's group.
  let held: MatchEvent[] = [];
  const place = (g: FeedGroup, e: MatchEvent) => g.items.push({ event: e, godViewOnly: isGodViewOnly(e) });
  for (const e of log) {
    if (MARKER_KINDS.has(e.kind)) continue;
    if (e.kind === "turn_timed_out") {
      held.push(e);
      continue;
    }
    const target = groupFor(e, phase);
    if (target) {
      const found = groups.find((g) => g.key === target.key);
      current = found ?? { ...target, items: [] };
      if (!found) groups.push(current);
    }
    if (!current) {
      current = { key: "setup", kind: "setup", title: "Setup", items: [] };
      groups.push(current);
    }
    for (const h of held) place(current, h);
    held = [];
    if (e.kind === "phase_started") phase = { phase: String(e.data.phase), cycle: Number(e.data.cycle) };
    else place(current, e);
  }
  if (held.length && current) for (const h of held) place(current, h);
  for (const g of groups) if (g.kind === "vote") g.tally = tallyOf(g.items.map((i) => i.event));
  return groups;
}

function tallyOf(events: MatchEvent[]): VoteTally {
  const votes = (events.find((e) => e.kind === "votes_revealed")?.data.votes ?? []) as Vote[];
  const bySeat = new Map<number, number>();
  let abstain = 0;
  for (const v of votes) {
    if (v.target === "abstain") abstain++;
    else bySeat.set(v.target, (bySeat.get(v.target) ?? 0) + 1);
  }
  const counts: VoteTally["counts"] = [...bySeat]
    .sort(([a, x], [b, y]) => y - x || a - b)
    .map(([target, n]) => ({ target, votes: n }));
  if (abstain) counts.push({ target: "abstain", votes: abstain });
  const died = events.find((e) => e.kind === "player_died");
  const none = events.find((e) => e.kind === "no_elimination");
  return {
    counts,
    eliminated: died ? Number(died.data.seat) : null,
    outcome: died ? "eliminated" : none ? (none.data.reason === "tie" ? "tie" : "all_abstain") : "pending",
  };
}
