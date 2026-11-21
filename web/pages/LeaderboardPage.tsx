// /leaderboard?league=<id>: one Rating history chart for one League, toggled between
// Overall, Village and Wolf Rating (each on its own y-scale), with the Leaderboard table below. The history refetches every 15 s and whenever
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

/** Toggle order; labels match the Leaderboard table's Side names. */
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
          <h2>Rating by Match{league ? ` · ${league.league.name}` : ""}</h2>
          {history ? <RatingCharts history={history} /> : <p className="lg-loading">Loading…</p>}
        </section>
        {leaderboard ? <Leaderboard data={leaderboard} /> : <p className="lg-loading">Feed: {status}</p>}
      </div>
    </main>
  );
}

function RatingCharts({ history }: { history: RatingsHistory }) {
  const [metric, setMetric] = useState(METRICS[0]!.metric);
  const current = METRICS.find((m) => m.metric === metric) ?? METRICS[0]!;
  return (
    <div className="lg-chart-toggle">
      <div className="lg-chips" role="group" aria-label="Rating shown">
        {METRICS.map((m) => (
          <button
            key={m.metric}
            type="button"
            className={`lg-chip${m.metric === metric ? " on" : ""}`}
            aria-pressed={m.metric === metric}
            data-testid={`rating-metric-${m.metric}`}
            onClick={() => setMetric(m.metric)}
          >
            {m.yTitle.replace(" Rating", "")}
          </button>
        ))}
      </div>
      {history.points.length === 0 ? (
        <RatingChart history={history} />
      ) : (
        <RatingChart key={current.metric} history={history} metric={current.metric} yTitle={current.yTitle} legend xTitle />
      )}
    </div>
  );
}
