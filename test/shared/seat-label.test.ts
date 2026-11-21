import { describe, expect, it } from "vitest";
import { spectatorLabel } from "../../src/shared/seat-label";

describe("spectatorLabel", () => {
  it("shows the Display Name with the Agent and copy label", () => {
    expect(spectatorLabel({ displayName: "Mara", label: "Hydrogen #2" })).toBe("Mara · Hydrogen #2");
  });

  it("falls back to the copy label for Matches recorded before Display Names", () => {
    expect(spectatorLabel({ label: "Hydrogen #2" })).toBe("Hydrogen #2");
  });
});
