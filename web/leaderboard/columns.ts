// Leaderboard table columns: Ratings, Matches, wins per Side and per role, Calibration, timeouts and cost.
import type { AgentStanding } from "../../src/shared/protocol";
import { formatUsd } from "../cost";
import { formatWinFraction } from "./win-fraction";

/** Display names for Side keys; unknown Sides are capitalised. */
const SIDE_NAMES: Record<string, string> = { wolf: "Wolf", village: "Village" };
export const sideName = (side: string): string => SIDE_NAMES[side] ?? side.charAt(0).toUpperCase() + side.slice(1);

export const formatRating = (r: number): string => Math.round(r).toString();

interface Column {
  key: string;
  label: string;
  title?: string;
  value: (row: AgentStanding) => number;
  render: (row: AgentStanding) => string;
}

/** The table's columns: the Ruleset's Sides, then its roles (if any) as per-role win cells. */
export function columns(sides: string[], roles: readonly { id: string; name: string }[] = []): Column[] {
  return [
    { key: "overall", label: "Overall", title: "Mean of the Side Ratings", value: (r) => r.overall, render: (r) => formatRating(r.overall) },
    ...sides.map((s) => ({
      key: `rating:${s}`,
      label: sideName(s),
      title: `${sideName(s)} Rating`,
      value: (r: AgentStanding) => r.ratings[s] ?? 0,
      render: (r: AgentStanding) => formatRating(r.ratings[s] ?? 0),
    })),
    { key: "matches", label: "Matches", value: (r) => r.matches, render: (r) => String(r.matches) },
    ...sides.map((s) => ({
      key: `wins:${s}`,
      label: `${sideName(s)} wins`,
      title: `Wins out of Matches played as ${sideName(s)}`,
      value: (r: AgentStanding) => r.wins[s] ?? 0,
      render: (r: AgentStanding) => formatWinFraction(r.wins[s] ?? 0, r.played?.[s] ?? 0),
    })),
    ...roles.map((role) => ({
      key: `role:${role.id}`,
      label: `${role.name} wins`,
      title: `Wins out of Matches played as ${role.name}`,
      value: (r: AgentStanding) => r.roles?.[role.id]?.won ?? 0,
      render: (r: AgentStanding) => formatWinFraction(r.roles?.[role.id]?.won ?? 0, r.roles?.[role.id]?.played ?? 0),
    })),
    {
      key: "calibration",
      label: "Calibration",
      title: "Brier score of village-side beliefs at each vote (lower is better)",
      // Sorting is best-first: lower Brier first, Agents with no score last.
      value: (r) => (r.calibration === null ? -Infinity : -r.calibration),
      render: (r) => (r.calibration === null ? "—" : r.calibration.toFixed(3)),
    },
    { key: "timeouts", label: "Timeouts", title: "Turns that missed their deadline", value: (r) => r.timeouts, render: (r) => String(r.timeouts) },
    {
      key: "cost",
      label: "$/Match",
      title: "Measured model cost per Match, all of the Agent's seats",
      // Sorting is cheapest first, Agents with no cost yet last.
      value: (r) => (r.costPerMatch == null ? -Infinity : -r.costPerMatch),
      render: (r) => (r.costPerMatch == null ? "—" : formatUsd(r.costPerMatch)),
    },
  ];
}
