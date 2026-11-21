import { describe, expect, it } from "vitest";
import { costOf, PRICES, priceUsage } from "../../src/core/pricing";
import { realRoster } from "../../src/rulesets/werewolf/roster";
import { DECISION_MODEL } from "../../src/narrator/decisions";

describe("pricing", () => {
  it("bills uncached input, cached input and output plus thought separately (total input includes cached)", () => {
    // Hydrogen: $1.50 in, $0.075 cached, $7.50 out (per 1M tokens).
    // 10,000 input of which 4,000 cached: 6,000 × $1.5e-6 + 4,000 × $7.5e-8 = $0.009 + $0.0003;
    // output 200 + thought 800 = 1,000 × $7.5e-6 = $0.0075. Total $0.0168.
    const usage = { input: 10_000, cached: 4_000, thought: 800, output: 200 };
    expect(costOf(usage, PRICES["gemini-4-hydrogen"]!)).toBeCloseTo(0.0168, 12);
    // 3.5 Flash-Lite: $0.30 / $0.03 / $2.50.
    expect(costOf(usage, PRICES["gemini-3.5-flash-lite"]!)).toBeCloseTo(0.00442, 12);
    // gemini-decision-1: $0.10 input, output free.
    expect(costOf({ input: 50_000, cached: 0, thought: 0, output: 7 }, PRICES[DECISION_MODEL]!)).toBeCloseTo(0.005, 12);
  });

  it("has the FINDINGS section 9 price for every model on the real roster", () => {
    expect(PRICES["gemini-4-hydrogen"]).toEqual({ input: 1.5, cached: 0.075, output: 7.5 });
    expect(PRICES["gemini-3.8-flash"]).toEqual({ input: 0.75, cached: 0.075, output: 3.75 });
    expect(PRICES["gemini-3.6-flash"]).toEqual({ input: 0.75, cached: 0.075, output: 3.75 });
    expect(PRICES["gemini-3.5-flash-lite"]).toEqual({ input: 0.3, cached: 0.03, output: 2.5 });
    expect(PRICES["gemini-decision-1"]).toEqual({ input: 0.1, cached: 0.1, output: 0 });
    for (const a of realRoster()) expect(PRICES[a.model!], a.model).toBeDefined();
    // Other Managed Agent models an operator may put on a roster.
    expect(PRICES["gemini-4-neon"]).toEqual({ input: 3, cached: 0.15, output: 15 });
    expect(PRICES["gemini-4-carbon"]).toEqual({ input: 2, cached: 0.1, output: 10 });
    expect(PRICES["gemini-4-argon"]).toEqual({ input: 2, cached: 0.1, output: 10 });
  });

  it("prices per-model token totals and names any model without a price instead of billing it at $0 silently", () => {
    const r = priceUsage({
      "gemini-3.6-flash": { input: 1_000_000, cached: 0, thought: 0, output: 0 },
      "mystery-model": { input: 5, cached: 0, thought: 0, output: 0 },
    });
    expect(r.cost).toBeCloseTo(0.75, 12);
    expect(r.unpriced).toEqual(["mystery-model"]);
  });
});
