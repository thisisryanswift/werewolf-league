// Agent Instructions assembly (wl-cizy). Instructions are keyed text sections, marked
// in the source by `<!-- section: NAME -->` lines; everything above the first marker
// is for humans and is never given to an Agent. The Ruleset names each seat's keys;
// the Match assembles the seat's text with `assembleInstructions`.

const MARKER = /^<!-- section: ([\w-]+) -->[ \t]*$/gm;

/** Parse `<!-- section: NAME -->` sections, or null if the text has no marker. */
export function parseSections(text: string): Map<string, string> | null {
  const marks = [...text.matchAll(MARKER)];
  if (marks.length === 0) return null;
  const sections = new Map<string, string>();
  marks.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1]!.index : text.length;
    sections.set(m[1]!, text.slice(start, end).trim());
  });
  return sections;
}

/**
 * The text for one seat: the named sections of `source`, in order. Unsectioned text
 * has no role-specific parts, so it is used whole. Throws if a named section is missing.
 */
export function assembleInstructions(source: string, keys: string[]): string {
  const sections = parseSections(source);
  if (!sections) return source.trim();
  return keys
    .map((k) => {
      const s = sections.get(k);
      if (s === undefined) throw new Error(`Agent Instructions have no "${k}" section`);
      return s;
    })
    .join("\n\n");
}
