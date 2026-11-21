// What the Narrator asks about a Werewolf Match, and the Narrator's View log it reads.
// The log includes roles, Wolf Chat and Seer results: drama depends on what the
// wolves are doing. Nothing here is ever shown to Players.

import type { NarrationQuestions } from "../../core/narrator";
import type { RulesetEvent } from "../../shared/protocol";
import { ROLE_NAMES } from "./night";
import { describeEvent } from "./text";
import type { WerewolfState } from "./types";

export const NARRATION_QUESTIONS: NarrationQuestions = {
  drama: {
    question: "How dramatic is this Werewolf game right now, judged mostly by its most recent events?",
    levels: [
      "Calm: routine chatter, nobody under real pressure.",
      "Simmering: some suspicion and disagreement.",
      "Tense: pointed accusations, players on the defensive, a contested vote.",
      "Explosive: role claim wars, betrayals, shocking reveals or a vote decided by one ballot.",
    ],
  },
  flags: [
    {
      id: "claim_war",
      visibility: "public-safe",
      question: "Are two or more living players publicly claiming the same power role (Seer or Doctor), or openly contradicting each other's role claims?",
    },
    {
      id: "knife_edge_vote",
      visibility: "public-safe",
      question: "Was the most recent vote, or is the coming vote, on a knife edge, decided or likely decided by a single ballot?",
    },
    {
      id: "table_split",
      visibility: "public-safe",
      question: "Is the table split into camps that disagree about who the Werewolves are?",
    },
    {
      id: "village_lost_power_role",
      visibility: "public-safe",
      question: "Has the Village voted out its own Seer or Doctor, as revealed when that player died?",
    },
    {
      id: "wolf_fooling_table",
      visibility: "secret",
      question: "Is a Werewolf successfully fooling the table: trusted by villagers, or steering suspicion onto innocent players?",
    },
    {
      id: "wolves_split",
      visibility: "secret",
      question: "Are the two Werewolves disagreeing with each other in Wolf Chat, about whom to kill or how to play?",
    },
  ],
};

/** Narrator's View lines for private events whose Player-facing text is written to that Player. */
const NARRATOR_VIEW_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  seer_result: (d) => `Night ${d.cycle}: the Seer (seat ${d.seat}) inspected seat ${d.target} and learned they are on the ${d.side} side.`,
  protect_chosen: (d) => `Night ${d.cycle}: the Doctor (seat ${d.seat}) protected seat ${d.target}.`,
  doctor_saved: (d) => `Night ${d.cycle}: the Doctor's protection saved seat ${d.target} from the Werewolves.`,
};

/**
 * The Narrator's View log. `extra` adds lines for event kinds the Narrator skips
 * (the Analyst's input adds beliefs this way); the Narrator never passes it.
 */
export function narrationLog(
  s: WerewolfState,
  events: RulesetEvent[],
  extra: Record<string, (d: Record<string, unknown>, s: WerewolfState) => string | null> = {},
): string {
  const roles = s.players.map((p) => `- Seat ${p.seat} (${p.label}): ${ROLE_NAMES[p.role]}${p.alive ? "" : ", dead"}`);
  const lines = events
    .map((e) =>
      extra[e.kind] ? extra[e.kind]!(e.data, s) : NARRATOR_VIEW_TEXT[e.kind] ? NARRATOR_VIEW_TEXT[e.kind]!(e.data) : describeEvent(e, s),
    )
    .filter((t): t is string => !!t);
  return [
    "A Werewolf game seen with Narrator's View (every secret visible). Two Werewolves hide among the players; the rest are the Village.",
    "Secret roles:",
    ...roles,
    "",
    "Events so far, oldest first:",
    ...lines,
  ].join("\n");
}
