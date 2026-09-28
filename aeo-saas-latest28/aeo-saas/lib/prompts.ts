import type { EngineAnswer, Keyword } from "./dataforseo";
import type { Row } from "./segment";

export type HeadingMode = "keep" | "optimise";

export function headingRule(mode: HeadingMode): string {
  return mode === "keep"
    ? "Headings (H1, H2, H3 and lower): leave every heading EXACTLY as written, word for word, including any HTML or markdown heading tags. Do not rephrase, extend, translate or turn any heading into a question. Only edit the body text."
    : "Headings (H1, H2, H3 and lower): you may lightly improve a heading by adding the primary keyword or making it more specific (e.g. \"Cloud ERP Software\" -> \"Cloud ERP Software for Small Businesses\"). Keep its heading level and tags, its original form and roughly its length (at most 4 extra words). Do NOT turn a heading into a question unless the original heading is already a question.";
}

export type Analysis = {
  topic: string;
  primary_query: string;
  seed_keyword: string;
  fanout: { query: string; intent: string }[];
  entities: string[];
};

export function analysisPrompt(section: string, language: string, market: string): string {
  return `You analyse website copy the way Google AI Overviews and AI Mode do. Those engines take the user's query, "fan it out" into related sub-queries (definition, how-to, comparison, cost, best-of, problems, follow-ups), and build an answer from pages that satisfy those intents.

The SECTION below is written in ${language}. Searchers are in ${market}.

Reply with ONLY one JSON object, no prose:
{
  "topic": "short topic name",
  "primary_query": "the single most likely Google query this section should appear for, as a searcher in ${market} would type it in ${language}",
  "seed_keyword": "1-4 word head keyword for keyword research, lowercase, in ${language}",
  "fanout": [ {"query": "realistic sub-query", "intent": "informational|commercial|transactional|navigational"} ],
  "entities": ["key entities, products, places, terms an AI answer would expect"]
}
Give 6-10 fanout items and 4-10 entities.

SECTION:
"""
${section}
"""`;
}

export type Proposal = {
  keys: { key: string; supported: boolean }[];
  rows: { id: number; proposed: string; aeo_keys: string[] }[];
};

const ENGINE_LABEL: Record<string, string> = {
  "Google AIO": "Google AI Overview",
  Voice: "Voice answers (Google featured snippet + People also ask)",
  ChatGPT: "ChatGPT (with web search)",
  Perplexity: "Perplexity",
};

export function proposalPrompt(p: {
  rows: Row[];
  language: string;
  market: string;
  brand: string;
  website: string;
  analysis: Analysis;
  engines: EngineAnswer[];
  keywords: Keyword[];
  confirmed: string[];
  targetPercent: number;
  headingMode: HeadingMode;
}): string {
  const engines = p.engines.filter((e) => e.present);
  const answers = engines.length
    ? engines.map((e) => `[${ENGINE_LABEL[e.engine]}]\n${e.text.slice(0, 2200)}`).join("\n\n")
    : "No live answers were available. Infer the terms answer engines typically use from the fan-out queries.";
  const kw = p.keywords.slice(0, 20).map((k) => `- ${k.keyword} | volume ${k.volume ?? "n/a"} | intent ${k.intent ?? "n/a"}`).join("\n");
  const heading = p.headingMode === "keep"
    ? 'Rows of type "heading": return them EXACTLY unchanged, with aeo_keys [].'
    : 'Rows of type "heading": you may add the primary keyword or make the heading more specific (at most 4 extra words, same form, same tags). Never turn a heading into a question unless it already is one.';

  return `You are a senior AEO (Answer Engine Optimization) editor. Below are the REAL answers that answer engines give today to the section's search query, and a website section split into numbered rows. Make the section more likely to be quoted and cited by these engines.

PRIMARY QUERY: ${p.analysis.primary_query}
RELATED QUERIES: ${p.analysis.fanout.map((f) => f.query).join("; ")}
LANGUAGE: ${p.language} (same as the section) · MARKET: ${p.market}${p.brand ? ` · BRAND: ${p.brand}` : ""}${p.website ? ` · WEBSITE: ${p.website}` : ""}

ENGINE ANSWERS
${answers}
${kw ? `\nGOOGLE KEYWORD DATA\n${kw}\n` : ""}${p.confirmed.length ? `\nFACTS CONFIRMED BY THE SITE OWNER (true for this brand, you may use them): ${p.confirmed.join("; ")}\n` : ""}
TASK
1. AEO keys: list 4-12 short phrases (1-5 words) that the engine answers use to answer the query — features, benefits, attributes, use cases, entities — and that the section does NOT already contain. Copy the wording exactly as the engines use it. Prefer phrases used by several engines.
2. For each key set "supported": true only if the section or the confirmed facts already state or clearly imply it is true for this brand/product (so using it adds no new claim). Otherwise false: it would be a new factual claim (a feature, material, certification, price…) that the owner must confirm.
3. Edit rows using ONLY supported keys:
   - Edit only rows where a key fits naturally; usually 40-60% of sentence rows. Leave the rest exactly as written.
   - An edited row keeps most of its original wording, meaning and tone. Never merge, split, add or delete rows.
   - Across the whole section change no more than ${p.targetPercent}% of the words.
   - The first sentence row should work as a direct, quotable answer to the primary query${p.brand ? `, naming "${p.brand}" clearly` : ""}.
   - ${heading}
   - Never invent facts, numbers, prices or guarantees.
   - aeo_keys for a row: the keys you inserted into it, copied exactly as they appear in "proposed" (max 3). Empty for unchanged rows.

Reply with ONLY this JSON:
{"keys": [{"key": "...", "supported": true}],
 "rows": [{"id": 1, "proposed": "...", "aeo_keys": ["..."]}]}
Include every row id.

ROWS
${JSON.stringify(p.rows.map((r) => ({ id: r.id, type: r.type, text: r.text })))}`;
}

export function parseJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function stripQuotes(text: string): string {
  return text.trim().replace(/^"""\s*/, "").replace(/\s*"""$/, "").trim();
}
