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

/** `n` distinct Display Names for a Match, the same for the same seed. */
export function drawDisplayNames(seed: string, n: number): string[] {
  if (n > DISPLAY_NAMES.length) throw new Error(`At most ${DISPLAY_NAMES.length} seats have Display Names, got ${n}`);
  return rngFrom(`${seed}:display-names`).shuffle(DISPLAY_NAMES).slice(0, n);
}
