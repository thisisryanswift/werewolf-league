// Agent37 instance names for pi seats: deterministic, so a retried provision names the same seat.

export const INSTANCE_PREFIX = "wl-pi-";
export const instanceName = (matchId: string, seat: number) => `${INSTANCE_PREFIX}${matchId}-${seat}`.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60);
