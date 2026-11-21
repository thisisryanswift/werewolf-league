// League switcher in the grid header: one link per League, ?league=<id> in the
// URL. Following a link loads that League's grid (a fresh feed); back returns.
import { LEAGUES, searchForLeague } from "../../src/shared/leagues";

export function LeagueSwitcher({ current }: { current: string }) {
  return (
    <nav className="lg-leagues" aria-label="League" data-testid="league-switcher">
      {LEAGUES.map((l) => (
        <a
          key={l.id}
          className={`lg-chip${l.id === current ? " on" : ""}`}
          href={searchForLeague(location.search, l.id)}
          aria-current={l.id === current ? "page" : undefined}
          data-league-id={l.id}
        >
          {l.name}
        </a>
      ))}
    </nav>
  );
}
