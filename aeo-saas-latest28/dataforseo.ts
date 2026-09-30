// DataForSEO client: related keywords with intent (Labs) and the live Google SERP with AI Overview.
// Results are cached in memory for 7 days; swap `cache` for a database table when you add Supabase.

import { TTLCache } from "./cache";

const BASE = (process.env.DATAFORSEO_BASE_URL || "https://api.dataforseo.com/v3").replace(/\/+$/, "");
const WEEK = 7 * 24 * 60 * 60 * 1000;
// "No AI Overview / no answer" is often temporary, so it is only remembered for a day.
const DAY = 24 * 60 * 60 * 1000;
// One slow DataForSEO call must not hold the whole run until the platform time limit.
const REQUEST_TIMEOUT_MS = 100_000;
const cache = new TTLCache<unknown>(WEEK, 2000);

export type Keyword = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
};

export type Source = { domain: string; url: string; title: string };

/** One answer engine's reply to the primary query. */
export type EngineAnswer = {
  engine: "Google AIO" | "Voice" | "ChatGPT" | "Perplexity";
  present: boolean;
  text: string;
  sources: Source[];
  error?: string;
  /** Set when this engine's answer came from a different query than the main one. */
  query?: string;
};

// Trimmed, because a space copied along with the login or password makes every call fail.
const login = () => (process.env.DATAFORSEO_LOGIN ?? "").trim();
const password = () => (process.env.DATAFORSEO_PASSWORD ?? "").trim();

export function dataForSeoConfigured(): boolean {
  return Boolean(login() && password());
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  const auth = Buffer.from(`${login()}:${password()}`).toString("base64");
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([body]),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (res.status === 401) throw new Error("DataForSEO rejected the login or password");
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  const json = await res.json();
  const task = json?.tasks?.[0];
  if (!task || task.status_code >= 40000) {
    throw new Error(`DataForSEO: ${task?.status_message ?? json?.status_message ?? "unknown error"}`);
  }
  return task.result?.[0] ?? null;
}

export async function relatedKeywords(
  seed: string, locationCode: number, languageCode: string, signal?: AbortSignal,
): Promise<Keyword[]> {
  const key = `rk:${seed.toLowerCase()}:${locationCode}:${languageCode}`;
  const hit = cache.get(key) as Keyword[] | undefined;
  if (hit) return hit;

  const result = await post("/dataforseo_labs/google/related_keywords/live", {
    keyword: seed.toLowerCase(),
    location_code: locationCode,
    language_code: languageCode,
    depth: 1,
    limit: 30,
    include_seed_keyword: true,
  }, signal);

  const items: any[] = result?.items ?? [];
  const rows: Keyword[] = [];
  const add = (kd: any) => {
    if (!kd?.keyword) return;
    rows.push({
      keyword: kd.keyword,
      volume: kd.keyword_info?.search_volume ?? null,
      difficulty: kd.keyword_properties?.keyword_difficulty ?? kd.keyword_info?.keyword_difficulty ?? null,
      intent: kd.search_intent_info?.main_intent ?? null,
    });
  };
  add(result?.seed_keyword_data);
  for (const it of items) add(it.keyword_data);

  const seen = new Set<string>();
  const unique = rows
    .filter((r) => !seen.has(r.keyword) && seen.add(r.keyword))
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  cache.set(key, unique);
  return unique;
}

function collectLinks(node: any, out: Map<string, Source>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => collectLinks(n, out)); return; }
  if (typeof node.url === "string" && /^https?:/.test(node.url)) {
    const domain = (node.domain || safeHost(node.url)).replace(/^www\./, "");
    if (!out.has(node.url)) out.set(node.url, { domain, url: node.url, title: node.title || node.source || domain });
  }
  for (const v of Object.values(node)) if (v && typeof v === "object") collectLinks(v, out);
}

function collectText(node: any, out: string[], keys = ["text", "markdown", "description", "title"]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => collectText(n, out, keys)); return; }
  for (const k of keys) if (typeof node[k] === "string" && node[k].trim()) out.push(node[k].trim());
  for (const [k, v] of Object.entries(node)) if (v && typeof v === "object" && k !== "annotations") collectText(v, out, keys);
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * Google SERP for the primary query: the AI Overview, plus the featured snippet and
 * "People also ask" answers, which voice assistants usually read out.
 */
export async function googleAnswers(
  query: string, locationCode: number, languageCode: string, signal?: AbortSignal,
): Promise<{ aio: EngineAnswer; voice: EngineAnswer }> {
  const key = `serp2:${query.toLowerCase()}:${locationCode}:${languageCode}`;
  const hit = cache.get(key) as { aio: EngineAnswer; voice: EngineAnswer } | undefined;
  if (hit) return hit;

  const result = await post("/serp/google/organic/live/advanced", {
    keyword: query, location_code: locationCode, language_code: languageCode, depth: 10, load_async_ai_overview: true,
  }, signal);
  const items: any[] = result?.items ?? [];

  const aioItem = items.find((i) => i.type === "ai_overview");
  const aioLinks = new Map<string, Source>();
  if (aioItem) collectLinks(aioItem, aioLinks);
  const aioText = aioItem ? String(aioItem.markdown ?? "") || (() => { const t: string[] = []; collectText(aioItem.items ?? aioItem, t, ["text"]); return t.join("\n"); })() : "";
  const aio: EngineAnswer = { engine: "Google AIO", present: Boolean(aioItem), text: aioText.slice(0, 4000), sources: [...aioLinks.values()].slice(0, 12) };

  const voiceParts: string[] = [];
  const voiceLinks = new Map<string, Source>();
  const fs = items.find((i) => i.type === "featured_snippet");
  if (fs) { if (fs.description) voiceParts.push(`Featured snippet: ${fs.description}`); collectLinks(fs, voiceLinks); }
  const paa = items.find((i) => i.type === "people_also_ask");
  for (const q of (paa?.items ?? []).slice(0, 6)) {
    const ans = (q.expanded_element ?? []).map((e: any) => e.description).filter(Boolean).join(" ");
    voiceParts.push(`Q: ${q.title}${ans ? `\nA: ${ans}` : ""}`);
    collectLinks(q.expanded_element, voiceLinks);
  }
  const voice: EngineAnswer = { engine: "Voice", present: voiceParts.length > 0, text: voiceParts.join("\n").slice(0, 4000), sources: [...voiceLinks.values()].slice(0, 8) };

  const out = { aio, voice };
  cache.set(key, out, aio.present ? WEEK : DAY);
  return out;
}

/** The real answer ChatGPT or Perplexity gives to a prompt, with web search, via DataForSEO AI Optimization. */
export async function llmAnswer(
  platform: "chat_gpt" | "perplexity", prompt: string, countryIso: string, signal?: AbortSignal,
): Promise<EngineAnswer> {
  const engine = platform === "chat_gpt" ? "ChatGPT" : "Perplexity";
  const model = platform === "chat_gpt"
    ? process.env.DFS_CHATGPT_MODEL || "gpt-4.1-mini"
    : process.env.DFS_PERPLEXITY_MODEL || "sonar";
  const key = `llm:${platform}:${model}:${countryIso}:${prompt.toLowerCase()}`;
  const hit = cache.get(key) as EngineAnswer | undefined;
  if (hit) return hit;

  const body: Record<string, unknown> = { user_prompt: prompt.slice(0, 500), model_name: model, max_output_tokens: 1200 };
  if (platform === "chat_gpt") body.web_search = true;
  else body.web_search_country_iso_code = countryIso;

  const result = await post(`/ai_optimization/${platform}/llm_responses/live`, body, signal);
  const texts: string[] = [];
  collectText(result?.items ?? [], texts, ["text"]);
  const links = new Map<string, Source>();
  collectLinks(result?.items ?? [], links);
  const text = texts.join("\n").slice(0, 4000);
  const out: EngineAnswer = { engine, present: Boolean(text), text, sources: [...links.values()].slice(0, 12) };
  cache.set(key, out, out.present ? WEEK : DAY);
  return out;
}
