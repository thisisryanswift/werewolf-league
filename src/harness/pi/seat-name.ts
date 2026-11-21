// Agent37 instance names for pi seats: deterministic, so a retried provision adopts the same
// seat's sandbox, and unique per seat: a readable (lossy) Match ID prefix, then a hash of the
// exact Match ID and seat, then the seat.

export const INSTANCE_PREFIX = "wl-pi-";

/** FNV-1a, 32-bit, as 8 hex digits. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function instanceName(matchId: string, seat: number): string {
  const readable = matchId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 32);
  return `${INSTANCE_PREFIX}${readable}-${fnv(`${matchId}\u0000${seat}`)}-${seat}`;
}
