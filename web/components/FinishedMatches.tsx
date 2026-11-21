// Finished Matches on the grid page: a pinned link to the featured finished
// Match (so a visitor can watch a complete Match at once) and the list of
// recently finished Matches. Each opens in the Match modal (#match=<id>) with its full log.
import { matchLabel } from "../../src/shared/match-label";
import type { FeaturedMatch, SettledMatch } from "../../src/shared/protocol";
import { matchHash } from "../grid/route";

export function FeaturedMatchLink({ featured }: { featured: FeaturedMatch | null }) {
  if (!featured) return null;
  return (
    <p className="featured" data-testid="featured-match" data-match-id={featured.matchId}>
      <strong>{featured.pinned ? "Featured" : "Latest"} finished Match:</strong>{" "}
      <a href={matchHash(featured.matchId)}>
        {matchLabel(featured)}, {featured.winner} won
      </a>
    </p>
  );
}

export function FinishedMatchList({ recent }: { recent: SettledMatch[] }) {
  if (recent.length === 0) return null;
  return (
    <section data-testid="finished-matches">
      <h2>Finished Matches</h2>
      <ul className="recent">
        {recent.map((r) => (
          <li key={r.matchId}>
            <a href={matchHash(r.matchId)}>{matchLabel(r)}</a>: {r.winner} won
          </li>
        ))}
      </ul>
    </section>
  );
}
