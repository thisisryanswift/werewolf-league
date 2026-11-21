// The dense live grid (after prototype variant E): a header with live counts,
// the leaderboard strip and the Narrator's View toggle; sort and filter chips; then the
// three promoted large tiles and the rest. Each tile links to #match=<id>.
import { memo, useMemo, useRef, useState } from "react";
import { matchLabel } from "../../src/shared/match-label";
import type { LeagueSnapshot, MatchTile } from "../../src/shared/protocol";
import { FeaturedMatchLink } from "../components/FinishedMatches";
import { landedFeatures } from "../help/features";
import { HelpButtons } from "../help/HelpButtons";
import type { FeedStatus } from "../useMatchFeed";
import { LeagueSwitcher } from "./LeagueSwitcher";
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

export interface LeagueGridProps {
  league: LeagueSnapshot;
  status: FeedStatus;
  activity: Record<string, number>;
  narratorView: boolean;
  onNarratorViewChange: (on: boolean) => void;
}

export function LeagueGrid({ league, status, activity, narratorView, onNarratorViewChange }: LeagueGridProps) {
  const [sort, setSort] = useState<GridSort>("drama");
  const [filter, setFilter] = useState<GridFilter>("all");
  // Promotion holds without Drama Scores carry over from one arrangement to the next.
  const held = useRef<PromotionHold[]>([]);
  const grid = useMemo(() => {
    const g = arrangeGrid(league.tiles, { sort, filter, narratorView, activity, now: Date.now(), held: held.current });
    held.current = g.held;
    return g;
  }, [league.tiles, sort, filter, narratorView, activity]);
  // Keyed by content so the help dialogs re-render only when a feature lands.
  const landedKey = [...landedFeatures(league.tiles)].join(",");
  const landed = useMemo(() => new Set(landedKey.split(",").filter(Boolean)), [landedKey]);

  return (
    <div className="lg">
      <header className="lg-hdr">
        <div className="lg-row">
          <h1>Werewolf League</h1>
          <LeagueSwitcher current={league.league.id} />
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
          <HelpButtons landed={landed} />
          <button type="button" className={`lg-narrator${narratorView ? " on" : ""}`} aria-pressed={narratorView} data-testid="grid-narrator-view" onClick={() => onNarratorViewChange(!narratorView)}>
            {narratorView ? "◉ Narrator's View on" : "○ Narrator's View off"}
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
          <Tile key={t.matchId} tile={t} narratorView={narratorView} big />
        ))}
        {grid.rest.map((t) => (
          <Tile key={t.matchId} tile={t} narratorView={narratorView} big={false} />
        ))}
        {grid.promoted.length + grid.rest.length === 0 && (
          <p className="lg-empty">{league.tiles.length === 0 ? "No live Matches." : "No Matches match this filter."}</p>
        )}
      </section>
    </div>
  );
}

// Unchanged tiles keep their object identity through applyLeagueDiff, so memo skips them.
// The tile (wl-fuy2): a top line, a headline, a fixed Drama Score slot and the pips;
// large (promoted) tiles add the latest quote, an "Also:" flag line and the thinking count.
const Tile = memo(function Tile({ tile, narratorView, big }: { tile: MatchTile; narratorView: boolean; big: boolean }) {
  const v = tileView(tile, narratorView);
  const k = v.kicker;
  const step = big ? k.step : k.stepShort;
  return (
    <a
      className={`lg-tile ${v.fill}${big ? " big" : ""}`}
      href={matchHash(tile.matchId)}
      data-testid="match-tile"
      data-match-id={tile.matchId}
      aria-label={`Open ${matchLabel(tile)}`}
    >
      <span className="t-head">
        <span className="t-main">
          <span className="t-kick">
            <span className="t-id">{k.match}</span>
            {k.chip && (
              <>
                <span aria-hidden="true">·</span>
                <span className="t-chip">{k.chip}</span>
              </>
            )}
            {step && (
              <>
                <span aria-hidden="true">·</span>
                <span className="t-step">{step}</span>
              </>
            )}
          </span>
          <span className="t-headline" title={v.headline}>
            {v.headline}
          </span>
        </span>
        <span className="t-score" title={v.drama === null ? "No Drama Score yet" : "Drama Score"}>
          <b>{v.dramaText}</b>
          {big && <small>drama</small>}
        </span>
      </span>
      {big && (
        <span className="t-quote" data-testid="latest-speech">
          {v.speech ? (
            <>
              <q>{v.speech.text}</q>
              <cite>{v.speech.name}</cite>
            </>
          ) : (
            <i>No one has spoken yet.</i>
          )}
        </span>
      )}
      {big && v.also && (
        <span className="t-also">
          Also: <span className={`t-flag${v.also.flag.secret ? " secret" : ""}`}>{v.also.flag.name}</span>
          {v.also.more > 0 && <span className="t-more">+{v.also.more}</span>}
        </span>
      )}
      <span className="t-foot">
        <span className="pips">
          {v.pips.map((p) => (
            <span
              key={p.seat}
              className={["pip", !p.alive && "dead", p.role && `role-${p.role}`, p.speaking && "speaking"].filter(Boolean).join(" ")}
              title={`P${p.seat}${p.role ? ` · ${p.role}` : ""}${p.alive ? "" : " · dead"}${p.speaking ? " · spoke last" : ""}`}
            >
              {p.mark}
            </span>
          ))}
        </span>
        {v.timeouts > 0 && (
          <span className="t-timeouts" title="Turns timed out">
            ⏱ {v.timeouts}
          </span>
        )}
        {big && v.thinking !== null && v.thinking > 0 && (
          <span className="think" title="Players thinking">
            <span className="spin" aria-hidden="true" />
            {v.thinking} thinking
          </span>
        )}
      </span>
    </a>
  );
});
