// /leaderboard?league=<id>: the Overall Rating history chart for one League, with
// the Leaderboard table below it. The history refetches every 15 s and whenever
// the League feed sends a new leaderboard (a rated Match settled).
import { useEffect, useState } from "react";
import { Leaderboard } from "../components/Leaderboard";
import { LeagueSwitcher } from "../grid/LeagueSwitcher";
import { RatingChart } from "../leaderboard/RatingChart";
import { useLeagueFeed } from "../useLeagueFeed";
import { leagueIdFromSearch, searchForLeague } from "../../src/shared/leagues";
import type { RatingsHistory } from "../../src/core/ratings-history";
import "../grid/grid.css";

const POLL_MS = 15_000;

export function LeaderboardPage() {
  const [leagueId] = useState(() => leagueIdFromSearch(location.search));
  const { league, status } = useLeagueFeed(leagueId);
  const [history, setHistory] = useState<RatingsHistory | null>(null);
  const leaderboard = league?.leaderboard;

  useEffect(() => {
    let stopped = false;
    const load = () =>
      fetch(`/api/leagues/${encodeURIComponent(leagueId)}/ratings-history`)
        .then((r) => (r.ok ? (r.json() as Promise<RatingsHistory>) : null))
        .then((h) => !stopped && h && setHistory(h))
        .catch(() => {});
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // A new leaderboard message means a rated Match settled: refetch now.
  }, [leagueId, leaderboard]);

  return (
    <main className="lg-page">
      <div className="lg">
        <header className="lg-hdr">
          <div className="lg-row">
            <h1>Werewolf League</h1>
            <LeagueSwitcher current={leagueId} />
            <span className="lg-spacer" />
            <a className="lg-chip" href={`/${searchForLeague("", leagueId)}`}>
              ← Grid
            </a>
          </div>
        </header>
      </div>
      <div className="lg-below lg-board">
        <section className="lg-card lg-chart-card">
          <h2>Overall Rating by Match{league ? ` · ${league.league.name}` : ""}</h2>
          {history ? <RatingChart history={history} /> : <p className="lg-loading">Loading…</p>}
        </section>
        {leaderboard ? <Leaderboard data={leaderboard} /> : <p className="lg-loading">Feed: {status}</p>}
      </div>
    </main>
  );
}
