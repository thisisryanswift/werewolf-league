// Path-based routing without a router dependency.
import { HomePage } from "./pages/HomePage";
import { MatchPage } from "./pages/MatchPage";

export function App() {
  const match = /^\/matches\/([\w-]+)\/?$/.exec(window.location.pathname);
  if (match) return <MatchPage matchId={match[1]!} />;
  return <HomePage />;
}
