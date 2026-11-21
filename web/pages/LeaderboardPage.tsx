// /leaderboard?league=<id>: stacked Overall, Village and Wolf Rating history charts
// for one League (one legend, one y-scale), with the Leaderboard table below them. The history refetches every 15 s and whenever
// the League feed sends a new leaderboard (a rated Match settled).
import { useEffect, useState } from "react";
import { Leaderboard } from "../components/Leaderboard";
import { LeagueSwitcher } from "../grid/LeagueSwitcher";
import { sharedDomain } from "../leaderboard/chart-model";
import { RatingChart } from "../leaderboard/RatingChart";
import { useLeagueFeed } from "../useLeagueFeed";
import { leagueIdFromSearch, searchForLeague } from "../../src/shared/leagues";
import type { RatingsHistory } from "../../src/core/ratings-history";
import "../grid/grid.css";

const POLL_MS = 15_000;

/** Stacked top to bottom; labels match the Leaderboard table's Side names. */
const METRICS = [
  { metric: "overall", yTitle: "Overall Rating" },
  { metric: "village", yTitle: "Village Rating" },
  { metric: "wolf", yTitle: "Wolf Rating" },
];

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
          <h2>Overall, Village and Wolf Rating by Match{league ? ` · ${league.league.name}` : ""}</h2>
          {history ? <RatingCharts history={history} /> : <p className="lg-loading">Loading…</p>}
        </section>
        {leaderboard ? <Leaderboard data={leaderboard} /> : <p className="lg-loading">Feed: {status}</p>}
      </div>
    </main>
  );
}

function RatingCharts({ history }: { history: RatingsHistory }) {
  if (history.points.length === 0) return <RatingChart history={history} />;
  const domain = sharedDomain(history, METRICS.map((m) => m.metric));
  return (
    <div className="lg-chart-stack">
      {METRICS.map((m, i) => (
        <RatingChart
          key={m.metric}
          history={history}
          metric={m.metric}
          yTitle={m.yTitle}
          height={i === METRICS.length - 1 ? 290 : 270}
          domain={domain}
          legend={i === 0}
          xTitle={i === METRICS.length - 1}
        />
      ))}
    </div>
  );
}
