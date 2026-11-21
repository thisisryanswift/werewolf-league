// The help modals' copy lives in docs/help/*.md so the human can edit it in one
// place. This renders the small Markdown subset those files use into plain
// blocks (no HTML injection): "# " title, "## " headings, paragraphs (each
// source line its own line), "- " and "1. " lists, **bold** and bare https://
// links. A paragraph preceded by <!-- Show only if wl-xxxx has landed --> is
// left out unless that ticket's feature is in `landed`.

/** A run of inline text: plain, bold, or a link. */
export type Inline = { text: string; bold?: true; href?: string };
export type Block =
  | { kind: "h2"; text: Inline[] }
  | { kind: "p"; lines: Inline[][] }
  | { kind: "ul" | "ol"; items: Inline[][] };

export interface HelpDoc {
  title: string;
  blocks: Block[];
}

const GATE = /^<!--\s*Show only if (wl-[a-z0-9]+) has landed\s*-->$/i;

export function helpDoc(markdown: string, landed: ReadonlySet<string>): HelpDoc {
  let title = "";
  const blocks: Block[] = [];
  for (const chunk of markdown.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    let lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    const gate = lines[0] && GATE.exec(lines[0]);
    if (gate) {
      if (!landed.has(gate[1]!.toLowerCase())) continue;
      lines = lines.slice(1);
    }
    lines = lines.filter((l) => !/^<!--.*-->$/.test(l));
    while (lines.length > 0) {
      const line = lines[0]!;
      if (line.startsWith("# ")) {
        title = line.slice(2).trim();
        lines.shift();
      } else if (line.startsWith("## ")) {
        blocks.push({ kind: "h2", text: inline(line.slice(3).trim()) });
        lines.shift();
      } else if (/^(-|\d+\.)\s/.test(line)) {
        const kind = line.startsWith("-") ? "ul" : "ol";
        const items: Inline[][] = [];
        while (lines[0] && (kind === "ul" ? /^-\s/ : /^\d+\.\s/).test(lines[0])) items.push(inline(lines.shift()!.replace(/^(-|\d+\.)\s+/, "")));
        blocks.push({ kind, items });
      } else {
        const para: Inline[][] = [];
        while (lines[0] && !/^(#{1,2} |-\s|\d+\.\s)/.test(lines[0])) para.push(inline(lines.shift()!));
        blocks.push({ kind: "p", lines: para });
      }
    }
  }
  return { title, blocks };
}

/** Splits a line into plain, **bold** and bare-URL runs. */
export function inline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*|(https:\/\/[^\s)]+[^\s).,;:!?])/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2]!, href: m[2]! });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}
