// Path-based routing without a router dependency.
import { HomePage } from "./pages/HomePage";
import { MatchPage } from "./pages/MatchPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";

export function App() {
  const match = /^\/matches\/([\w-]+)\/?$/.exec(window.location.pathname);
  if (match) return <MatchPage matchId={match[1]!} />;
  if (/^\/leaderboard\/?$/.test(window.location.pathname)) return <LeaderboardPage />;
  return <HomePage />;
}
