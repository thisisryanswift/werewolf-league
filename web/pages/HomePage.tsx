// Home page: a live grid of the League's Match tiles. Each tile links to its Match page.
import type { MatchTile } from "../../src/shared/protocol";
import { Leaderboard } from "../components/Leaderboard";
import { FeaturedMatchLink, FinishedMatchList } from "../components/FinishedMatches";
import { spectatorLabel } from "../../src/shared/seat-label";
import { useLeagueFeed } from "../useLeagueFeed";
import { formatUsd } from "../cost";

function phaseText(tile: MatchTile): string {
  const s = tile.summary;
  if (!s) return tile.status === "starting" ? "Starting…" : "Waiting…";
  return s.round === null ? s.phase : `${s.phase} ${s.round}`;
}

function Tile({ tile }: { tile: MatchTile }) {
  const alive = new Set(tile.summary?.alive ?? tile.seats.map((s) => s.seat));
  const speech = tile.summary?.latestSpeech;
  const speaker = speech && tile.seats.find((s) => s.seat === speech.seat);
  return (
    <li className="tile" data-testid="match-tile" data-match-id={tile.matchId}>
      <a href={`/matches/${tile.matchId}`}>
        <h2 className="tile-phase">{phaseText(tile)}</h2>
        <p className="tile-alive">
          {alive.size} of {tile.seats.length} alive
        </p>
        <ul className="tile-seats">
          {tile.seats.map((s) => (
            <li key={s.seat} className={alive.has(s.seat) ? "" : "dead"}>
              {s.seat}. {spectatorLabel(s)}
            </li>
          ))}
        </ul>
        {tile.summary?.cost !== undefined && (
          <p className="tile-cost" data-testid="tile-cost">
            Cost so far {formatUsd(tile.summary.cost)}
          </p>
        )}
        <p className="tile-speech">
          {speech ? (
            <>
              <strong>{speaker ? spectatorLabel(speaker) : `Seat ${speech.seat}`}:</strong> {speech.text}
            </>
          ) : (
            <span className="muted">No speeches yet</span>
          )}
        </p>
      </a>
    </li>
  );
}

export function HomePage() {
  const { league, status } = useLeagueFeed();
  return (
    <main>
      <h1>Werewolf League</h1>
      <p data-testid="feed-status">
        Feed: {status}
        {league && (
          <>
            {" · "}
            {league.config.paused ? "Paused" : `${league.tiles.length} of ${league.config.n} Matches live`}
            {" · "}
            {league.stats.settled} finished
            {league.spend && (
              <span data-testid="league-spend">
                {" · "}Spend {formatUsd(league.spend.total)} ({formatUsd(league.spend.sinceResume)} since resume)
                {league.config.spendCap != null && ` · cap ${formatUsd(league.config.spendCap)}`}
              </span>
            )}
          </>
        )}
      </p>
      {league && <FeaturedMatchLink featured={league.featured} />}
      {league?.blocked && <p className="blocked">League can't start Matches: {league.blocked}</p>}
      {league && <Leaderboard data={league.leaderboard} />}
      {league && league.tiles.length === 0 && <p className="muted">No live Matches.</p>}
      <ul className="match-grid">
        {league?.tiles.map((t) => <Tile key={t.matchId} tile={t} />)}
      </ul>
      {league && <FinishedMatchList recent={league.recent} />}
    </main>
  );
}
