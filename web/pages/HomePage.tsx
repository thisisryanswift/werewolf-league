// Home page: the dense live grid of the League's Matches, with the Match modal
// over it for #match=<id>. God View (on by default) is shared by the grid and
// the modal. The full leaderboard and the finished Matches follow the grid.
import { useState } from "react";
import { Leaderboard } from "../components/Leaderboard";
import { FinishedMatchList } from "../components/FinishedMatches";
import { LeagueGrid } from "../grid/LeagueGrid";
import { MatchModal } from "../grid/MatchModal";
import { useMatchRoute } from "../grid/useMatchRoute";
import { useLeagueFeed } from "../useLeagueFeed";
import { formatUsd } from "../cost";

export function HomePage() {
  const { league, status, activity } = useLeagueFeed();
  const [godView, setGodView] = useState(true);
  const route = useMatchRoute();
  return (
    <main className="lg-page">
      {league ? (
        <LeagueGrid league={league} status={status} activity={activity} godView={godView} onGodViewChange={setGodView} />
      ) : (
        <p className="lg-loading" data-testid="feed-status">
          Feed: {status}
        </p>
      )}
      {league && (
        <div className="lg-below">
          {league.spend && (
            <p className="lg-spend" data-testid="league-spend">
              League spend {formatUsd(league.spend.total)} ({formatUsd(league.spend.sinceResume)} since resume)
              {league.config.spendCap != null && ` · cap ${formatUsd(league.config.spendCap)}`}
            </p>
          )}
          <Leaderboard data={league.leaderboard} />
          <FinishedMatchList recent={league.recent} />
        </div>
      )}
      {route.matchId && <MatchModal key={route.matchId} matchId={route.matchId} godView={godView} onGodViewChange={setGodView} onClose={route.close} />}
    </main>
  );
}
