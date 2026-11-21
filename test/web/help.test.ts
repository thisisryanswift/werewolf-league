// The help modals' copy: docs/help/*.md rendered to blocks, with sections for
// unlanded features left out.
import { describe, expect, it } from "vitest";
import type { MatchTile } from "../../src/shared/protocol";
import { landedFeatures } from "../../web/help/features";
import { helpDoc } from "../../web/help/markdown";

describe("help copy", () => {
  it("leaves out a section gated on a feature that has not landed, and keeps it once it has", () => {
    const md = "# About\n\n**Always?**\nYes.\n\n<!-- Show only if wl-zst1 has landed -->\n**Pi?**\nSoon.\n\n**After?**\nStill here.\n";
    const without = helpDoc(md, new Set());
    expect(without.title).toBe("About");
    expect(JSON.stringify(without.blocks)).not.toContain("Pi?");
    expect(JSON.stringify(without.blocks)).toContain("Still here.");
    expect(JSON.stringify(helpDoc(md, new Set(["wl-zst1"])).blocks)).toContain("Pi?");
  });

  it("leaves out a single list item or line gated inside a paragraph", () => {
    const md = "**Who?**\n- Hydrogen plays.\n<!-- Show only if wl-ofdn has landed -->\n- Neon analyzes.\n- Narrator narrates.";
    expect(helpDoc(md, new Set()).blocks).toEqual([
      { kind: "p", lines: [[{ text: "Who?", bold: true }]] },
      { kind: "ul", items: [[{ text: "Hydrogen plays." }], [{ text: "Narrator narrates." }]] },
    ]);
    expect(JSON.stringify(helpDoc(md, new Set(["wl-ofdn"])).blocks)).toContain("Neon analyzes.");
  });

  it("renders headings, lists, bold runs and bare links, one paragraph line per source line", () => {
    const md = "## Roles\n\n- **Seer:** inspects.\n- Doctor\n\n1. Night.\n2. Day.\n\n**Q?**\nSee https://example.com/x.";
    expect(helpDoc(md, new Set()).blocks).toEqual([
      { kind: "h2", text: [{ text: "Roles" }] },
      { kind: "ul", items: [[{ text: "Seer:", bold: true }, { text: " inspects." }], [{ text: "Doctor" }]] },
      { kind: "ol", items: [[{ text: "Night." }], [{ text: "Day." }]] },
      {
        kind: "p",
        lines: [[{ text: "Q?", bold: true }], [{ text: "See " }, { text: "https://example.com/x", href: "https://example.com/x" }, { text: "." }]],
      },
    ]);
  });
});

describe("landed features", () => {
  const tile = (summary: object | null) => ({ matchId: "m", seed: "s", status: "running", seats: [], startedAt: 1, summary }) as unknown as MatchTile;
  it("counts Match cost as landed only once a live tile carries one, and Pi seats as not landed", () => {
    expect(landedFeatures([tile(null), tile({ phase: "Day" })])).toEqual(new Set());
    expect(landedFeatures([tile({ phase: "Day" }), tile({ phase: "Day", cost: 0.43 })])).toEqual(new Set(["wl-64dn"]));
  });
});

describe("the shipped help copy", () => {
  const files = import.meta.glob("../../docs/help/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const howToPlay = files["../../docs/help/how-to-play.md"]!;
  const about = files["../../docs/help/about.md"]!;
  const text = (md: string, landed = new Set<string>()) => JSON.stringify(helpDoc(md, landed));

  it("has a title for each modal and uses Narrator's View, never God View", () => {
    expect(helpDoc(howToPlay, new Set()).title).toBe("How to play");
    expect(helpDoc(about, new Set()).title).toBe("About this project");
    for (const md of [howToPlay, about]) {
      expect(md).not.toMatch(/god view|god mode/i);
    }
    expect(text(howToPlay)).toContain("Narrator's View");
  });

  it("hides the Pi and cost answers until wl-zst1 and wl-64dn land", () => {
    expect(text(about)).not.toMatch(/Pi Durable|What does a Match cost/);
    expect(text(about, new Set(["wl-zst1", "wl-64dn"]))).toMatch(/Pi Durable[\s\S]*What does a Match cost/);
  });
});
