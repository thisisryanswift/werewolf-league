// The Match modal's URL: #match=<id> on the grid page, so a link opens straight into it.

const HASH = /^#match=([\w-]+)$/;

export const matchHash = (matchId: string) => `#match=${matchId}`;

/** The Match a URL hash opens, or null. */
export function matchIdFromHash(hash: string): string | null {
  return HASH.exec(hash)?.[1] ?? null;
}
