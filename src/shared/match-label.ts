// How Spectators name a Match: "Match 127" by its Match Number, or by its short
// Match ID for a Match without one (a one-off, or one started before numbering).

export interface LabelledMatch {
  matchId: string;
  matchNumber?: number;
}

/** "Match 127", else "Match 492beb1a". */
export function matchLabel({ matchId, matchNumber }: LabelledMatch): string {
  return `Match ${matchNumber ?? matchId.slice(0, 8)}`;
}
