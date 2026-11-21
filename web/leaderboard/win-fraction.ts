/** Wins out of Matches played on a Side, e.g. "3/12 (25%)"; a dash before any. */
export const formatWinFraction = (wins: number, played: number): string =>
  played === 0 ? "—" : `${wins}/${played} (${Math.round((100 * wins) / played)}%)`;
