// Split a section into table rows: one row per heading and one per sentence.
import { isHeadingLine } from "./diff";

export type Row = { id: number; type: "heading" | "text"; text: string; label: string };
export type Segmented = { rows: Row[]; layout: (number[] | null)[] };

const SPLIT = /(?<=[.!?।؟。！？]["'’”)\]]*)\s+(?=\S)/;
// A split after these is not a sentence end: "U.S.", "e.g.", "Dr." and similar.
const ABBREV = /(?:\b(?:[A-Za-z]\.){1,4}|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|vs|etc|approx|No|Nos|Inc|Ltd|Co|Corp|Fig|Vol|Ave|Rd)\.)["'’”)\]]*$/;

/** Sentences of one paragraph line. Keeps abbreviations and lowercase continuations together. */
export function splitSentences(line: string): string[] {
  const out: string[] = [];
  for (const piece of line.split(SPLIT).map((x) => x.trim()).filter(Boolean)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && (ABBREV.test(prev) || /^[\p{Ll}\d,;:)]/u.test(piece))) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out;
}

function headingLabel(t: string): string {
  const md = t.match(/^(#{1,6})\s/);
  const html = t.match(/^<h([1-6])/i);
  const lvl = md ? md[1].length : html ? Number(html[1]) : 0;
  return lvl ? `Heading (H${lvl})` : "Heading";
}

export function segment(src: string): Segmented {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const rows: Row[] = [];
  const layout: (number[] | null)[] = [];
  lines.forEach((line, li) => {
    const t = line.trim();
    if (!t) { layout.push(null); return; }
    if (isHeadingLine(line, lines[li - 1] ?? "", lines[li + 1] ?? "")) {
      rows.push({ id: rows.length + 1, type: "heading", text: t, label: headingLabel(t) });
      layout.push([rows.length - 1]);
      return;
    }
    const parts = /^<[a-z]/i.test(t) ? [t] : splitSentences(t);
    layout.push(parts.map((p) => { rows.push({ id: rows.length + 1, type: "text", text: p, label: "" }); return rows.length - 1; }));
  });
  let n = 0;
  rows.forEach((r) => { if (r.type === "text") r.label = String(++n); });
  return { rows, layout };
}

/** Re-assemble the section, taking each row's text from `pick`. */
export function rebuild(seg: Segmented, pick: (i: number) => string): string {
  return seg.layout
    .map((ids) => (ids === null ? "" : ids.map((i) => pick(i)).join(" ")))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
