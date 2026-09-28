// Change measurement and word diff, shared by the API route and the UI.
// Scripts written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Myanmar)
// are compared character by character; everything else word by word.

const NO_SPACE_SCRIPTS =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-๿຀-໿ក-៿က-႟]/;

export function usesCharTokens(text: string): boolean {
  const sample = text.slice(0, 2000);
  const hits = sample.match(new RegExp(NO_SPACE_SCRIPTS, "g"))?.length ?? 0;
  return hits > sample.replace(/\s/g, "").length * 0.3;
}

/** Tokens that carry meaning (no whitespace). */
export function contentTokens(text: string, charMode = usesCharTokens(text)): string[] {
  if (charMode) return Array.from(text.replace(/\s+/g, ""));
  return text.split(/\s+/).filter(Boolean);
}

/** Tokens including whitespace, so a diff can be re-assembled for display. */
export function displayTokens(text: string, charMode = usesCharTokens(text)): string[] {
  if (charMode) return Array.from(text);
  return text.match(/\s+|[^\s]+/g) ?? [];
}

const MAX_CELLS = 6_000_000;

function lcsLength(a: string[], b: string[]): number | null {
  if (a.length * b.length > MAX_CELLS) return null;
  let prev = new Uint32Array(b.length + 1);
  let cur = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return prev[b.length];
}

/**
 * Share of the text that changed, 0-100.
 * 1 - (tokens kept in the same order) / (length of the longer version).
 * Returns null when the texts are too long to compare.
 */
export function changePercent(original: string, edited: string): number | null {
  const charMode = usesCharTokens(original);
  const a = contentTokens(original, charMode);
  const b = contentTokens(edited, charMode);
  if (!a.length) return b.length ? 100 : 0;
  const lcs = lcsLength(a, b);
  if (lcs === null) return null;
  return Math.round((1 - lcs / Math.max(a.length, b.length)) * 100);
}

export type DiffOp = { op: "=" | "+" | "-"; text: string };

export function diffOps(original: string, edited: string): DiffOp[] | null {
  const charMode = usesCharTokens(original);
  const A = displayTokens(original, charMode);
  const B = displayTokens(edited, charMode);
  const n = A.length;
  const m = B.length;
  if (n * m > MAX_CELLS) return null;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("=", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push("-", A[i++]);
    else push("+", B[j++]);
  }
  while (i < n) push("-", A[i++]);
  while (j < m) push("+", B[j++]);
  return ops;
}

// ---------- Heading protection ----------
// A heading line is: an HTML heading (<h1>…</h1> to <h6>), a markdown heading (# … ######),
// or a short standalone line (≤ 14 words) without sentence-ending punctuation.
const SENTENCE_END = /[.!?।。！？؟:;,]$/;
const QUESTION_END = /[?？؟]\s*(<\/h[1-6]>)?\s*$/i;
const HTML_HEADING = /^<h[1-6][^>]*>[\s\S]*<\/h[1-6]>$/i;
const MD_HEADING = /^#{1,6}\s+\S/;

export function isHeadingLine(line: string, prev = "", next = ""): boolean {
  const t = line.trim();
  if (!t) return false;
  if (HTML_HEADING.test(t) || MD_HEADING.test(t)) return true;
  if (/^<[a-z]/i.test(t) || /^([-*•]|\d+[.)])\s/.test(t)) return false;
  const standalone = !prev.trim() || !next.trim() || prev === "" || next === "";
  const words = t.split(/\s+/).length;
  if (!standalone || words > 14 || t.length > 120) return false;
  // A short standalone question ("Why Choose Our Bags?") is a heading too.
  if (QUESTION_END.test(t)) return words <= 10 && !/[.!?。！？।]\s/.test(t);
  return !SENTENCE_END.test(t);
}

/**
 * Put original headings back, line by line (non-empty lines are matched in order).
 * mode "all": every heading is restored word for word.
 * mode "questions": only headings the model turned into a question (when the original was not one).
 * If the number of non-empty lines differs, the text is returned unchanged.
 */
export function restoreHeadings(original: string, edited: string, mode: "all" | "questions" = "all"): string {
  const aLines = original.replace(/\r\n/g, "\n").split("\n");
  const bLines = edited.replace(/\r\n/g, "\n").split("\n");
  const aIdx = aLines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  const bIdx = bLines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  if (aIdx.length !== bIdx.length) return edited;
  let changed = false;
  aIdx.forEach((ai, k) => {
    const orig = aLines[ai];
    if (!isHeadingLine(orig, aLines[ai - 1] ?? "", aLines[ai + 1] ?? "")) return;
    const bi = bIdx[k];
    const now = bLines[bi];
    if (now.trim() === orig.trim()) return;
    const madeQuestion = QUESTION_END.test(now.trim()) && !QUESTION_END.test(orig.trim());
    if (mode === "all" || madeQuestion) { bLines[bi] = orig.trim(); changed = true; }
  });
  return changed ? bLines.join("\n") : edited;
}
