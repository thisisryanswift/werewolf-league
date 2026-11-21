// League identity: the League id (routes, Matches, the grid) and the League DO
// name it lives in. The default League keeps the DO name it was deployed under
// as the only League ("default"), so its ratings, spend and history carry over.

import { DEFAULT_LEAGUE_ID, findLeague } from "../shared/leagues";

/** League DO names that differ from the League id. */
// pi-open was reset at 16:55 on 2026-11-21 (human decision: equal Match counts with one seat per
// Agent); its earlier Matches stay in the "pi-open" DO, still viewable by Match id.
const DO_NAMES: Record<string, string> = { [DEFAULT_LEAGUE_ID]: "default", "pi-open": "pi-open-2" };
const IDS: Record<string, string> = Object.fromEntries(Object.entries(DO_NAMES).map(([id, name]) => [name, id]));

/**
 * The League DO name for a League id. Unregistered ids (tests' own Leagues) are
 * used as the DO name as they are, and so is "default", the name Matches started
 * before multiple Leagues recorded.
 */
export function leagueDoName(id: string | undefined): string {
  const league = id ?? DEFAULT_LEAGUE_ID;
  return DO_NAMES[league] ?? league;
}

/** The League id of a League DO, by its name. */
export function leagueIdOf(doName: string | undefined): string {
  return doName === undefined ? DEFAULT_LEAGUE_ID : (IDS[doName] ?? doName);
}

/** The League DO a Match or Player reports to; absent means the default League. */
export function leagueStub(env: Env, id: string | undefined) {
  return env.LEAGUE.getByName(leagueDoName(id));
}

export const isLeagueId = (id: string): boolean => findLeague(id) !== undefined;
