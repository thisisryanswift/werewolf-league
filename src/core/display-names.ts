// Display Names: the plain first names Players go by inside a Match, so no
// Player can tell which Agent sits in another seat. Drawn from the match seed.

import { rngFrom } from "./rng";

/**
 * The fixed name list. Plain first names only: none looks like a model name, and
 * none matches a default (fake) roster Agent name (Ada, Bo, Cy, Di, Ed, Flo, Gus).
 */
export const DISPLAY_NAMES: readonly string[] = [
  "Mara", "Tobin", "Ines", "Felix", "Nora", "Otto", "Lena", "Hugo",
  "Rosa", "Jonah", "Elsa", "Milo", "Vera", "Caleb", "Iris", "Bruno",
  "Hazel", "Silas", "Greta", "Leon", "Maeve", "Oscar", "Wren", "Arlo",
];

/**
 * `n` distinct Display Names for a Match, the same for the same seed and Agents.
 * `avoid` holds the participating Agents' names and ids: a name that appears in any
 * of them as a whole word (case-insensitive) is never drawn, so no Display Name can
 * reveal an Agent.
 */
export function drawDisplayNames(seed: string, n: number, avoid: string[] = []): string[] {
  const taken = (name: string) => avoid.some((a) => new RegExp(`(^|[^a-z])${name.toLowerCase()}([^a-z]|$)`).test(a.toLowerCase()));
  const pool = DISPLAY_NAMES.filter((name) => !taken(name));
  if (n > pool.length) throw new Error(`Only ${pool.length} Display Names are available for this table, but it has ${n} seats`);
  return rngFrom(`${seed}:display-names`).shuffle(pool).slice(0, n);
}
