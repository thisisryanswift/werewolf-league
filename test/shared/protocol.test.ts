import { describe, expect, it } from "vitest";
import { mergeEvents, type MatchEvent } from "../../src/shared/protocol";

const ev = (seq: number, kind = "k"): MatchEvent => ({ seq, ts: 0, kind, audience: "all", data: {} });

describe("mergeEvents", () => {
  it("dedupes by seq, keeps the first copy and orders by seq", () => {
    const merged = mergeEvents([ev(1), ev(2, "first")], [ev(3), ev(2, "second"), ev(1)]);
    expect(merged.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(merged[1]!.kind).toBe("first");
  });
});
