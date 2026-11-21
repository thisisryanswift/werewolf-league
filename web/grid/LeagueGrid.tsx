// The dense live grid (after prototype variant E): a header with live counts,
// the leaderboard strip and the God View toggle; sort and filter chips; then the
// three promoted large tiles and the rest. Each tile links to #match=<id>.
import { memo, useMemo, useRef, useState } from "react";
import type { LeagueSnapshot, MatchTile } from "../../src/shared/protocol";
import { FeaturedMatchLink } from "../components/FinishedMatches";
import type { FeedStatus } from "../useMatchFeed";
import { arrangeGrid, tileView, topAgents, type GridFilter, type GridSort, type PromotionHold } from "./model";
import { matchHash } from "./route";
import "./grid.css";

const SORTS: { key: GridSort; label: string }[] = [
  { key: "drama", label: "Drama" },
  { key: "alive", label: "Alive" },
  { key: "number", label: "#" },
];
const FILTER_LABELS: Record<GridFilter, string> = { all: "All", flagged: "⚑ Flagged", voting: "Voting", night: "Night" };
const STRIP_AGENTS = 5;

export const matchLabel = (matchId: string) => `Match ${matchId.slice(0, 8)}`;

export interface LeagueGridProps {
  league: LeagueSnapshot;
  status: FeedStatus;
  activity: Record<string, number>;
  godView: boolean;
  onGodViewChange: (on: boolean) => void;
}

export function LeagueGrid({ league, status, activity, godView, onGodViewChange }: LeagueGridProps) {
  const [sort, setSort] = useState<GridSort>("drama");
  const [filter, setFilter] = useState<GridFilter>("all");
  // Promotion holds without Drama Scores carry over from one arrangement to the next.
  const held = useRef<PromotionHold[]>([]);
  const grid = useMemo(() => {
    const g = arrangeGrid(league.tiles, { sort, filter, godView, activity, now: Date.now(), held: held.current });
    held.current = g.held;
    return g;
  }, [league.tiles, sort, filter, godView, activity]);

  return (
    <div className="lg">
      <header className="lg-hdr">
        <div className="lg-row">
          <h1>Werewolf League</h1>
          <span className="lg-count" data-testid="live-count">
            <b>{league.tiles.length}</b> {league.config.paused ? "live · paused" : `of ${league.config.n} live`}
          </span>
          <span className="lg-count">
            <b>{league.stats.settled.toLocaleString()}</b> finished
          </span>
          <ol className="lg-board" aria-label="Top Agents by Overall Rating" data-testid="leaderboard-strip">
            {topAgents(league.leaderboard, STRIP_AGENTS).map((a) => (
              // Keyed by rating, so an entry re-mounts (and flashes) when a settlement changes it.
              <li key={`${a.agentId}:${a.rating}`} className={a.rank === 1 ? "first" : undefined} data-agent-id={a.agentId}>
                {a.rank} {a.name} <b>{a.rating}</b>
              </li>
            ))}
          </ol>
          <span className={`lg-feed lg-feed-${status}`} data-testid="feed-status" title="Live connection to the League">
            {status === "live" ? "● live" : status}
          </span>
          <button type="button" className={`lg-god${godView ? " on" : ""}`} aria-pressed={godView} data-testid="grid-god-view" onClick={() => onGodViewChange(!godView)}>
            {godView ? "◉ God View on" : "○ God View off"}
          </button>
        </div>
        <div className="lg-row lg-ctrls">
          <span className="lg-lbl">Sort</span>
          {SORTS.map((s) => {
            const unavailable = s.key === "drama" && !grid.hasDrama;
            return (
              <button
                key={s.key}
                type="button"
                className={`lg-chip${grid.sort === s.key ? " on" : ""}`}
                aria-pressed={grid.sort === s.key}
                disabled={unavailable}
                title={unavailable ? "No Drama Scores yet: sorted by Match number" : undefined}
                data-sort={s.key}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            );
          })}
          <span className="lg-lbl">Show</span>
          {grid.filters.map((f) => (
            <button key={f} type="button" className={`lg-chip${grid.filter === f ? " on" : ""}`} aria-pressed={grid.filter === f} data-filter={f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
          <FeaturedMatchLink featured={league.featured} />
        </div>
      </header>
      {league.blocked && <p className="lg-blocked">League can't start Matches: {league.blocked}</p>}
      <section className="lg-grid" aria-label="Live Matches" data-testid="match-grid">
        {grid.promoted.map((t) => (
          <Tile key={t.matchId} tile={t} godView={godView} big />
        ))}
        {grid.rest.map((t) => (
          <Tile key={t.matchId} tile={t} godView={godView} big={false} />
        ))}
        {grid.promoted.length + grid.rest.length === 0 && (
          <p className="lg-empty">{league.tiles.length === 0 ? "No live Matches." : "No Matches match this filter."}</p>
        )}
      </section>
    </div>
  );
}

// Unchanged tiles keep their object identity through applyLeagueDiff, so memo skips them.
const Tile = memo(function Tile({ tile, godView, big }: { tile: MatchTile; godView: boolean; big: boolean }) {
  const v = tileView(tile, godView);
  const cls = ["lg-tile", big && "big", big && !v.night && "hot", v.night && "night", v.flags.length > 0 && "flagged", !tile.summary && "starting"]
    .filter(Boolean)
    .join(" ");
  return (
    <a className={cls} href={matchHash(tile.matchId)} data-testid="match-tile" data-match-id={tile.matchId} aria-label={`Open ${matchLabel(tile.matchId)}`}>
      {v.flags.length > 0 && !big && (
        <span className="lg-sticker" title={v.flags.join(" · ")}>
          ⚑ {v.flags.length}
        </span>
      )}
      <span className="t-top">
        <span className="t-id">{tile.matchId.slice(0, 8)}</span>
        <span className="t-phase">
          {v.night ? "☾ " : v.phase.startsWith("Day") ? "☀ " : ""}
          {v.phase}
        </span>
      </span>
      <span className="t-pa">
        <span className="pips">
          {v.pips.map((p) => (
            <span
              key={p.seat}
              className={["pip", !p.alive && "dead", p.role === "werewolf" && "wolf"].filter(Boolean).join(" ")}
              title={`P${p.seat}${p.role ? ` · ${p.role}` : ""}${p.alive ? "" : " · dead"}`}
            >
              {!p.alive ? "✕" : p.role === "werewolf" ? "W" : ""}
            </span>
          ))}
        </span>
        <span className="t-alive">
          {v.alive}/{v.total} alive
          {v.timeouts > 0 && <span title="Turns timed out"> · ⏱{v.timeouts}</span>}
        </span>
      </span>
      {v.drama !== null && (
        <span className="t-drama" title="Drama Score">
          <span className="dbar">
            <i style={{ width: `${v.drama}%` }} />
          </span>
          <span className="dpct">{v.drama}% drama</span>
          {big && v.flags.length > 0 && (
            <span className="t-flags">
              {v.flags.map((f) => (
                <span key={f}>⚑ {f}</span>
              ))}
            </span>
          )}
        </span>
      )}
      {big && (
        <span className="t-line" data-testid="latest-speech">
          {v.speech ? (
            <>
              <b>
                P{v.speech.seat} · {v.speech.speaker}
              </b>{" "}
              “{v.speech.text}”
            </>
          ) : (
            <i>No speeches yet.</i>
          )}
        </span>
      )}
      <span className="t-foot">
        <span className={`tag${v.voting ? " vote" : ""}`}>{v.step ?? (tile.summary ? v.phase : "Starting")}</span>
        {v.thinking !== null && v.thinking > 0 && (
          <span className="think" title="Players thinking">
            <span className="spin" aria-hidden="true" />×{v.thinking}
          </span>
        )}
      </span>
    </a>
  );
});
