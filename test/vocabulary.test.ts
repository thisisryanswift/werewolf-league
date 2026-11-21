import { describe, expect, it } from "vitest";

// Source text of the app (Worker and web), bundled at build time.
const sources = import.meta.glob(["../src/**/*.{ts,tsx,css}", "../web/**/*.{ts,tsx,css,html}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("vocabulary (GLOSSARY.md)", () => {
  it("says Narrator's View, never God View or god mode, in labels and identifiers", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/god[\s_-]*(view|mode)/i);
      expect(text, file).not.toMatch(/\bgod\b/i);
    }
  });
});
