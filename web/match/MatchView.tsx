// The Match view: seats with Claim badges and turn markers, Accusation arcs, a
// feed grouped by Night / Speech Round / Right of Reply / Vote with a tally per
// vote, God View panels, and the end-of-Match screen.
//
// Mounting contract (the /matches/:id page now, wl-gtil's Match modal later):
//   <MatchView matchId={id} />                        God View on, managed inside
//   <MatchView matchId={id} godView={on} onGodViewChange={setOn} onClose={close} titleId="m-title" />
// - It opens its own Match WebSocket on mount (full log first, then live
//   events) and closes it on unmount; a new matchId starts from an empty log.
// - It fills its container (width and height 100%); the container sets the size.
// - onClose, when given, adds a Close button; Esc/backdrop/back belong to the modal.
// - titleId is put on the heading, for the dialog's aria-labelledby.
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MatchEvent } from "../../src/shared/protocol";
import { formatRating, sideName } from "../components/Leaderboard";
import { describeEvent } from "../events";
import { useMatchFeed, type FeedStatus } from "../useMatchFeed";
import "./match-view.css";
import { buildMatchView, panelsFor, playerLabel, type EndScreen, type FeedGroup, type MatchView as View, type SeatView, type VoteTally } from "./model";
import { GodViewContext, MATCH_PANELS, SEAT_SLOTS, useGodView, type MatchPanelProps } from "./panels";

export interface MatchViewProps {
  matchId: string;
  /** Controlled God View; omit to let the view manage it (on by default). */
  godView?: boolean;
  onGodViewChange?: (on: boolean) => void;
  /** Shows a Close button that calls this. */
  onClose?: () => void;
  /** id for the heading, e.g. for a dialog's aria-labelledby. */
  titleId?: string;
}

export function MatchView(props: MatchViewProps) {
  // Keyed by Match, so switching Matches never carries state (or a log) across.
  return <MatchViewForMatch key={props.matchId} {...props} />;
}

function MatchViewForMatch({ matchId, godView: controlled, onGodViewChange, onClose, titleId }: MatchViewProps) {
  const { events, status } = useMatchFeed(matchId);
  const [own, setOwn] = useState(true);
  const godView = controlled ?? own;
  const setGodView = (on: boolean) => (onGodViewChange ? onGodViewChange(on) : setOwn(on));
  const view = useMemo(() => buildMatchView(events, { godView }), [events, godView]);
  const [showEnd, setShowEnd] = useState(true);
  const panelProps: MatchPanelProps = { events, view };

  return (
    <GodViewContext.Provider value={godView}>
      <div className={`mv${godView ? " mv-god" : ""}`} data-testid="match-view" data-god-view={godView}>
        <header className="mv-head">
          <h2 id={titleId} className="mv-title">
            Match {matchId.slice(0, 8)}
          </h2>
          <PhaseChip status={view.status} />
          <span className="mv-chip" data-testid="alive">
            {view.status.alive}/{view.status.total} alive
          </span>
          <FeedChip status={status} />
          {view.end && !showEnd && (
            <button type="button" className="mv-btn" onClick={() => setShowEnd(true)}>
              Show result
            </button>
          )}
          <button
            type="button"
            className="mv-btn mv-toggle"
            aria-pressed={godView}
            data-testid="god-view-toggle"
            onClick={() => setGodView(!godView)}
          >
            God View: {godView ? "on" : "off"}
          </button>
          {onClose && (
            <button type="button" className="mv-btn mv-close" onClick={onClose}>
              ✕ Close
            </button>
          )}
        </header>
        <div className="mv-body">
          <section className="mv-left" aria-label="Players">
            <Seats view={view} panelProps={panelProps} />
            <Panels placement="seats" godView={godView} panelProps={panelProps} />
            {!godView &&<p className="mv-note">God View off: living Players' roles, Wolf Chat, Night choices and turn markers are hidden.</p>}
          </section>
          <section className="mv-right" aria-label="Match log">
            {view.end && showEnd ? (
              <End end={view.end} onHide={() => setShowEnd(false)} />
            ) : (
              <>
                <Panels placement="feed" godView={godView} panelProps={panelProps} />
                <LatestTally view={view} />
                <Feed view={view} log={events} />
              </>
            )}
          </section>
        </div>
      </div>
    </GodViewContext.Provider>
  );
}

function Panels({ placement, godView, panelProps }: { placement: "seats" | "feed"; godView: boolean; panelProps: MatchPanelProps }) {
  return (
    <>
      {panelsFor(MATCH_PANELS, godView)
        .filter((p) => (p.placement ?? "seats") === placement)
        .map((p) => (
          <div key={p.id} className={`mv-box mv-panel mv-panel-${placement}`} data-panel={p.id} data-god-view-only={p.godViewOnly || undefined}>
            {p.title && <h3>{p.title}</h3>}
            <p.Component {...panelProps} />
          </div>
        ))}
    </>
  );
}

// ---- header -------------------------------------------------------------

function PhaseChip({ status }: { status: View["status"] }) {
  const text =
    status.phase === "night" ? `☾ Night ${status.cycle}` : status.phase === "day" ? `☀ Day ${status.cycle}` : status.phase === "over" ? "◆ Over" : "Waiting";
  return (
    <span className="mv-chip mv-phase" data-testid="phase">
      {text}
    </span>
  );
}

function FeedChip({ status }: { status: FeedStatus }) {
  return (
    <span className={`mv-chip mv-feed-${status}`} data-testid="feed-status" title="Live connection to the Match">
      {status === "live" ? "● live" : status}
    </span>
  );
}

// ---- seats --------------------------------------------------------------

const ROLE_ICON: Record<string, string> = { werewolf: "🐺", seer: "👁", doctor: "✚", villager: "⌂" };
const upper = (s: string) => s.toUpperCase();

function Seats({ view, panelProps }: { view: View; panelProps: MatchPanelProps }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [ys, setYs] = useState<Record<number, number>>({});
  const [height, setHeight] = useState(0);

  // Arcs are drawn from measured seat positions; re-measure whenever the layout changes.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const next: Record<number, number> = {};
      el.querySelectorAll<HTMLElement>("[data-seat]").forEach((li) => {
        const r = li.getBoundingClientRect();
        next[Number(li.dataset.seat)] = r.top - top + r.height / 2;
      });
      setYs(next);
      setHeight(el.getBoundingClientRect().height);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view.seats.length]);

  const acc = view.accusations;
  return (
    <>
      <div className="mv-acc-label">
        {acc ? (
          <>
            Accusations · Day {acc.cycle} <span className="mv-key mv-key-a">┄ Round A</span> <span className="mv-key mv-key-b">━ Round B</span>
          </>
        ) : (
          "Accusations · none yet"
        )}
      </div>
      <div className="mv-seatwrap" ref={wrap}>
        <Arcs links={acc?.links ?? []} ys={ys} height={height} />
        <ol className="mv-seats" data-testid="seats">
          {view.seats.map((s) => (
            <Seat key={s.seat} seat={s} panelProps={panelProps} />
          ))}
        </ol>
      </div>
    </>
  );
}

function Seat({ seat: s, panelProps }: { seat: SeatView; panelProps: MatchPanelProps }) {
  const godView = useGodView();
  return (
    <li
      className={["mv-seat", s.alive ? "" : "dead", s.role === "werewolf" ? "wolf" : ""].join(" ").trim()}
      data-seat={s.seat}
      data-role={s.role ?? undefined}
    >
      <span className="mv-num">P{s.seat}</span>
      <span className="mv-who">
        <span className="mv-name">
          {playerLabel(s)}
          {s.role && s.alive && (
            <span className={`mv-role ${s.role}`} data-testid="role">
              {ROLE_ICON[s.role] ?? ""} {upper(s.role)}
            </span>
          )}
        </span>
        <span className="mv-meta">
          {s.alive ? "ALIVE" : <>✕ DEAD · <b data-testid="role">{upper(s.role ?? "?")}</b></>}
          {s.timeouts > 0 && (
            <span className="mv-timeouts" data-testid="timeouts" title="Turns that missed their deadline">
              ⏱ timed out ×{s.timeouts}
            </span>
          )}
        </span>
        {s.claim && (
          <span className="mv-claim" data-testid="claim">
            Claims {upper(s.claim.role)}
            {s.claim.results.length > 0 && `: ${s.claim.results.map((r) => `P${r.seat} ${upper(r.side)}`).join(", ")}`}
            {s.claim.truth && <b className={`mv-truth ${s.claim.truth}`}>{s.claim.truth === "true" ? "TRUE" : "LIE"}</b>}
          </span>
        )}
        {panelsFor(SEAT_SLOTS, godView).map((slot) => (
          <slot.Component key={slot.id} {...panelProps} seat={s} />
        ))}
      </span>
      {s.thinking && s.alive && (
        <span className="mv-turn" data-testid="thinking">
          <i className="mv-spin" aria-hidden="true" />
          thinking…
        </span>
      )}
    </li>
  );
}

const GUTTER = 64;

function Arcs({ links, ys, height }: { links: { from: number; to: number; round: string }[]; ys: Record<number, number>; height: number }) {
  const x0 = GUTTER - 4;
  return (
    <svg className="mv-gutter" width={GUTTER} height={height} viewBox={`0 0 ${GUTTER} ${height}`} aria-hidden="true">
      <defs>
        <marker id="mv-ah-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" className="mv-ah-a" />
        </marker>
        <marker id="mv-ah-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" className="mv-ah-b" />
        </marker>
      </defs>
      {links.map((a, i) => {
        const y1 = ys[a.from];
        const y2 = ys[a.to];
        if (y1 === undefined || y2 === undefined) return null;
        const b = a.round !== "A";
        const bulge = Math.min(GUTTER - 8, 14 + Math.abs(y2 - y1) * 0.09 + (b ? 6 : 0));
        const dy = b ? 6 : -6;
        return (
          <path
            key={i}
            className={`mv-arc ${b ? "b" : "a"}`}
            d={`M${x0},${y1 + dy} C${x0 - bulge},${y1 + dy} ${x0 - bulge},${y2 - dy} ${x0 - 2},${y2 - dy}`}
            markerEnd={`url(#mv-ah-${b ? "b" : "a"})`}
          >
            <title>
              P{a.from} accuses P{a.to} (Round {a.round})
            </title>
          </path>
        );
      })}
    </svg>
  );
}

// ---- votes --------------------------------------------------------------

function TallyBoxes({ tally, view }: { tally: VoteTally; view: View }) {
  const outcome =
    tally.outcome === "eliminated" && tally.eliminated !== null
      ? `P${tally.eliminated} eliminated (${upper(view.seats.find((s) => s.seat === tally.eliminated)?.role ?? "?")})`
      : tally.outcome === "tie"
        ? "Tie: no elimination"
        : tally.outcome === "all_abstain"
          ? "All abstained: no elimination"
          : "Counting…";
  return (
    <div className="mv-tally" data-testid="tally">
      <div className="mv-boxes">
        {tally.counts.map((c) => (
          <span key={String(c.target)} className={`mv-tbox${c.target === tally.eliminated ? " out" : ""}`}>
            <b>{c.votes}</b>
            <span>{c.target === "abstain" ? "ABSTAIN" : `P${c.target}`}</span>
            {c.target === tally.eliminated && <em>OUT</em>}
          </span>
        ))}
      </div>
      <p className="mv-outcome">{outcome}</p>
    </div>
  );
}

function LatestTally({ view }: { view: View }) {
  const vote = view.feed.filter((g) => g.kind === "vote").at(-1);
  return (
    <div className="mv-box mv-latest-vote">
      <h3>{vote ? `Vote · ${vote.title.replace(/ · Vote$/, "")}` : "Vote"}</h3>
      {vote?.tally ? <TallyBoxes tally={vote.tally} view={view} /> : <p className="mv-muted">No vote yet: the tally appears when a Day's vote resolves.</p>}
    </div>
  );
}

// ---- feed ---------------------------------------------------------------

type Vote = { seat: number; target: number | "abstain"; reason: string | null; timedOut: boolean };
type Speech = { seat: number; skipped: boolean; text: string | null; accuse: number[]; defend: number[]; claim: { role: string; results?: { seat: number; side: string }[] } | null };

/** Feed lines that only add noise; their data is shown elsewhere (or by a panel). */
const QUIET_KINDS = new Set(["beliefs_recorded", "phase_started"]);

function Feed({ view, log }: { view: View; log: MatchEvent[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  // Follow the newest events unless the Spectator has scrolled up.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  const live = liveLine(view);
  return (
    <ol
      className="mv-feed mv-box"
      ref={ref}
      data-testid="feed"
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {view.feed.map((g) => (
        <FeedGroupView key={g.key} group={g} view={view} log={log} />
      ))}
      {live && (
        <li className="mv-row live" data-testid="live">
          {live}
        </li>
      )}
    </ol>
  );
}

function liveLine(view: View): ReactNode {
  if (view.status.phase === null || view.status.phase === "over") return null;
  const thinking = view.seats.filter((s) => s.thinking && s.alive);
  const phase = view.status.phase === "night" ? `Night ${view.status.cycle}` : `Day ${view.status.cycle}`;
  if (!thinking.length) return <b>{phase} · in progress…</b>;
  return (
    <>
      <b>
        {phase} · {thinking.length} thinking
      </b>{" "}
      <span className="mv-marks">
        {thinking.map((s) => (
          <span key={s.seat} className="mv-mk">
            <i className="mv-spin" aria-hidden="true" /> P{s.seat}
          </span>
        ))}
      </span>
    </>
  );
}

const GROUP_ICON: Record<FeedGroup["kind"], string> = { setup: "◆", night: "☾", round: "☀", reply: "↩", vote: "☑", result: "◆" };

function FeedGroupView({ group, view, log }: { group: FeedGroup; view: View; log: MatchEvent[] }) {
  return (
    <>
      <li className={`mv-row hdr ${group.kind}`} data-group={group.kind}>
        {GROUP_ICON[group.kind]} {group.title}
      </li>
      {group.items
        .filter((i) => !QUIET_KINDS.has(i.event.kind))
        .map((i) => (
          <FeedLine key={i.event.seq} event={i.event} godViewOnly={i.godViewOnly} view={view} log={log} />
        ))}
      {group.tally && (
        <li className="mv-row tally-row">
          <TallyBoxes tally={group.tally} view={view} />
        </li>
      )}
    </>
  );
}

function Who({ seat, view }: { seat: number; view: View }) {
  const s = view.seats.find((x) => x.seat === seat);
  return (
    <>
      <b>P{seat}</b> <span className="mv-ag">{s ? playerLabel(s) : ""}</span>
    </>
  );
}

function FeedLine({ event: e, godViewOnly, view, log }: { event: MatchEvent; godViewOnly: boolean; view: View; log: MatchEvent[] }) {
  const d = e.data;
  if (e.kind === "speech") {
    const s = d as unknown as Speech;
    if (s.skipped) {
      return (
        <li className="mv-row skip" data-testid="speech">
          ⏱ <Who seat={s.seat} view={view} /> said nothing (timed out)
        </li>
      );
    }
    return (
      <li className={`mv-row speech${d.round === "reply" ? " reply" : ""}`} data-testid="speech" data-seat={s.seat}>
        <Who seat={s.seat} view={view} /> {s.text}{" "}
        {s.accuse.map((t) => (
          <span key={`a${t}`} className="mv-ch acc">
            → accuses P{t}
          </span>
        ))}
        {s.defend.map((t) => (
          <span key={`d${t}`} className="mv-ch def">
            ♡ defends P{t}
          </span>
        ))}
        {s.claim && (
          <span className="mv-ch clm">
            Claims {upper(s.claim.role)}
            {s.claim.results?.length ? `: ${s.claim.results.map((r) => `P${r.seat} ${upper(r.side)}`).join(", ")}` : ""}
          </span>
        )}
      </li>
    );
  }
  if (e.kind === "votes_revealed") {
    return (
      <>
        {(d.votes as Vote[]).map((v) => (
          <li key={v.seat} className={`mv-row ${v.timedOut ? "skip" : "ballot"}`} data-testid="ballot">
            <Who seat={v.seat} view={view} /> → <b>{v.target === "abstain" ? "ABSTAIN" : `P${v.target}`}</b>
            {v.timedOut ? " (timed out, counted as Abstain)" : v.reason ? ` · ${v.reason}` : ""}
          </li>
        ))}
      </>
    );
  }
  if (e.kind === "player_died") {
    return (
      <li className="mv-row death" data-testid="death">
        ✕ <Who seat={Number(d.seat)} view={view} /> {d.cause === "vote" ? "was voted out" : "was killed in the Night"} — <b>{upper(String(d.role))}</b>
      </li>
    );
  }
  if (e.kind === "replier_chosen") {
    return (
      <li className="mv-row info">
        Replier {String(d.slot)}: <Who seat={Number(d.seat)} view={view} /> ({String(d.score)} pts
        {(d.tied as number[]).length > 1 ? ", tie broken by the seed" : ""})
      </li>
    );
  }
  if (e.kind === "match_over") {
    return (
      <li className="mv-row info">
        Match over: {sideName(String(d.winner))} wins ({REASONS[String(d.reason)] ?? String(d.reason)})
      </li>
    );
  }
  const text = describeEvent(e, log);
  if (godViewOnly) {
    return (
      <li className={`mv-row god ${e.kind === "turn_timed_out" ? "timeout" : ""}`} data-god-view-only="true" data-kind={e.kind}>
        <span className="mv-gv">GOD VIEW</span> {e.kind === "wolf_chat" ? "🐺 " : ""}
        {text}
      </li>
    );
  }
  return (
    <li className="mv-row info" data-kind={e.kind}>
      {text}
    </li>
  );
}

// ---- end screen ---------------------------------------------------------

const REASONS: Record<string, string> = {
  all_werewolves_dead: "every Werewolf is dead",
  parity: "the Werewolves reached parity",
  cycle_cap: "Werewolves survived the last Night",
};
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

function End({ end, onHide }: { end: EndScreen; onHide: () => void }) {
  return (
    <div className="mv-end mv-box" data-testid="end-screen" data-winner={end.winner}>
      <div className="mv-end-head">
        <h3 className={`mv-winner ${end.winner}`}>{end.winner === "wolf" ? "🐺 Werewolves win" : end.winner === "village" ? "⌂ Village wins" : `${sideName(end.winner)} wins`}</h3>
        <span className="mv-end-reason">{REASONS[end.reason] ?? end.reason}</span>
        <button type="button" className="mv-btn" onClick={onHide}>
          Show the log
        </button>
      </div>
      <h4>Roles</h4>
      <ul className="mv-end-roles">
        {end.roles.map((r) => (
          <li key={r.seat} className={`${r.role}${r.alive ? "" : " dead"}`}>
            <b>P{r.seat}</b> {r.label} · {ROLE_ICON[r.role] ?? ""} {upper(r.role)}
            {!r.alive && " ✕"}
          </li>
        ))}
      </ul>
      <h4>Rating changes</h4>
      {end.ratings ? (
        <table className="mv-ratings" data-testid="rating-changes">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Side</th>
              <th>Before</th>
              <th>Change</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {end.ratings.map((r) => (
              <tr key={`${r.agentId}-${r.side}`}>
                <th>{r.name}</th>
                <td>{sideName(r.side)}</td>
                <td>{formatRating(r.before)}</td>
                <td className={r.delta >= 0 ? "up" : "down"}>{signed(r.delta)}</td>
                <td>{formatRating(r.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mv-muted" data-testid="ratings-pending">
          Rating changes appear when the League settles this Match. One-off Matches are unrated.
        </p>
      )}
    </div>
  );
}
