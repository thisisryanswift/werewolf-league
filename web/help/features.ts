// Which stretch features the help copy may mention, as the ticket IDs its
// "Show only if wl-xxxx has landed" gates name. Each is detected from what the
// League actually shows, so the copy never describes something that isn't there.
import type { MatchTile } from "../../src/shared/protocol";
import { tileView } from "../grid/model";

export function landedFeatures(tiles: readonly MatchTile[]): Set<string> {
  const landed = new Set<string>();
  // wl-64dn (Match cost): the tiles show a live cost.
  if (tiles.some((t) => tileView(t, false).cost !== null)) landed.add("wl-64dn");
  // wl-zst1 (Pi seats) has not landed; add its detection when it does.
  return landed;
}
