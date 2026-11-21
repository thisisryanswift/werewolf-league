import { describe, expect, it } from "vitest";
import { werewolf } from "../../src/rulesets/werewolf";
import type { RulesetEvent } from "../../src/shared/protocol";
import { act, dealt, nightActions } from "./helpers";

describe("Werewolf narration", () => {
  it("gives the Narrator a God View log with roles, Wolf Chat and Seer results", () => {
    const t = dealt("narration");
    const events: RulesetEvent[] = [];
    // One Wolf Chat exchange, then the Seer inspects a wolf.
    const chat = act(t.state, (seat) => ({ name: "wolf_chat", args: { text: `seat ${seat} wants a quiet Night` } }));
    events.push(...chat.events);
    const night = nightActions(chat.state, t.villagers.find((v) => v !== t.seer && v !== t.doctor)!, {
      [t.seer]: { name: "inspect", args: { target: t.wolves[0] } },
    });
    events.push(...night.events);

    const log = werewolf.narration!.log(night.state, events);
    expect(log).toContain("Secret roles:");
    expect(log).toContain(`Seat ${t.wolves[0]} (Agent ${t.wolves[0]}): Werewolf`);
    expect(log).toContain(`Seat ${t.seer} (Agent ${t.seer}): Seer`);
    expect(log).toContain(`Wolf Chat (Night 1) — Name${t.wolves[0]} (seat ${t.wolves[0]}): seat ${t.wolves[0]} wants a quiet Night`);
    expect(log).toContain(`the Seer (seat ${t.seer}) inspected seat ${t.wolves[0]} and learned they are on the wolf side`);
  });

  it("asks one drama score and the public-safe and secret Drama Flags", () => {
    const q = werewolf.narration!.questions;
    expect(q.drama.levels.length).toBeGreaterThanOrEqual(2);
    expect(q.flags.map((f) => [f.id, f.visibility])).toEqual([
      ["claim_war", "public-safe"],
      ["knife_edge_vote", "public-safe"],
      ["table_split", "public-safe"],
      ["village_lost_power_role", "public-safe"],
      ["wolf_fooling_table", "secret"],
      ["wolves_split", "secret"],
    ]);
  });
});
