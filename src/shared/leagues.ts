// The Leagues this deployment runs (wl-2lfo). Each is its own League DO with its
// own roster, config, Side Ratings, spend and admin controls. Elo is never
// compared across Leagues. Shared by the Worker and the grid's League switcher.

export interface LeagueInfo {
  /** The League id in routes and URLs (?league=<id>). */
  id: string;
  name: string;
}

/** The default League: the old single-League routes and a URL without ?league= use it. */
export const DEFAULT_LEAGUE_ID = "gemini-managed";

export const LEAGUES: readonly LeagueInfo[] = [
  { id: "gemini-managed", name: "Gemini Managed" },
  { id: "pi-open", name: "Pi Open Models" },
];

export const findLeague = (id: string): LeagueInfo | undefined => LEAGUES.find((l) => l.id === id);

/** The League a URL's query string selects; a missing or unknown ?league= is the default League. */
export function leagueIdFromSearch(search: string): string {
  const id = new URLSearchParams(search).get("league");
  return id && findLeague(id) ? id : DEFAULT_LEAGUE_ID;
}

/** The query string selecting a League, keeping any other parameters. */
export function searchForLeague(search: string, id: string): string {
  const params = new URLSearchParams(search);
  params.set("league", id);
  return `?${params.toString()}`;
}
