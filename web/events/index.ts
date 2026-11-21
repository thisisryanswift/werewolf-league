// Event text for the Match page. Each file owns the renderers for its events;
// unknown kinds fall back to raw JSON.
import type { MatchEvent } from "../../src/shared/protocol";
import { commonEvents } from "./common";
import { dayEvents } from "./day";
import { nightEvents } from "./night";
import { runnerEvents } from "./runner";
import type { EventRenderer } from "./types";

const RENDERERS: Record<string, EventRenderer> = { ...commonEvents, ...nightEvents, ...dayEvents, ...runnerEvents };

export function describeEvent(e: MatchEvent, log: MatchEvent[]): string {
  const r = RENDERERS[e.kind];
  return r ? r(e.data, log) : `${e.kind} ${JSON.stringify(e.data)}`;
}
