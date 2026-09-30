// One interface for any LLM provider.
//   LLM_PROVIDER=anthropic  → Claude via the Anthropic SDK
//   LLM_PROVIDER=gemini     → Google Gemini (only GEMINI_API_KEY is required)
//   LLM_PROVIDER=openai     → any OpenAI-compatible Chat Completions API:
//                             OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Together, a local Ollama…
import Anthropic from "@anthropic-ai/sdk";

export type LlmError = Error & { status?: number };

const PROVIDER = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();

// Google's OpenAI-compatible endpoint. "gemini-flash-latest" always points at the current Flash model;
// set LLM_MODEL to pin a specific one.
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

export const MODEL = process.env.LLM_MODEL || process.env.CLAUDE_MODEL
  || (PROVIDER === "gemini" ? GEMINI_DEFAULT_MODEL : "claude-opus-5-5");
export const FAST_MODEL = process.env.LLM_FAST_MODEL || process.env.CLAUDE_FAST_MODEL || MODEL;

const apiBase = () => (process.env.LLM_BASE_URL || (PROVIDER === "gemini" ? GEMINI_BASE_URL : "")).replace(/\/+$/, "");
const apiKey = () => (PROVIDER === "gemini" ? process.env.GEMINI_API_KEY || process.env.LLM_API_KEY : process.env.LLM_API_KEY);
/** Gemini "thinking" counts toward the output limit, so leave it room before the JSON answer. */
const outputTokens = (n: number) => (PROVIDER === "gemini" ? Math.min(Math.max(n * 2, 8192), 32768) : n);

export function llmConfigError(): string | null {
  if (PROVIDER === "anthropic") return process.env.ANTHROPIC_API_KEY ? null : "Server is missing ANTHROPIC_API_KEY.";
  if (PROVIDER === "gemini") return apiKey() ? null : "Server is missing GEMINI_API_KEY.";
  if (PROVIDER === "openai") {
    if (!process.env.LLM_BASE_URL) return "Server is missing LLM_BASE_URL.";
    if (!process.env.LLM_MODEL) return "Server is missing LLM_MODEL.";
    return null;
  }
  return `Unknown LLM_PROVIDER "${PROVIDER}". Use "anthropic", "gemini" or "openai".`;
}

/** Ask once and return the whole answer. */
export async function complete(model: string, prompt: string, maxTokens: number, signal?: AbortSignal): Promise<string> {
  if (PROVIDER === "anthropic") {
    const client = new Anthropic();
    const r = await client.messages.create({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }, { signal });
    return r.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  }
  const res = await openaiFetch({ model, max_tokens: outputTokens(maxTokens), messages: [{ role: "user", content: prompt }] }, signal);
  const json = await res.json();
  return String(json?.choices?.[0]?.message?.content ?? "");
}

/** Stream the answer; onText receives each new piece. Returns the whole answer. */
export async function streamText(
  model: string, prompt: string, maxTokens: number, onText: (delta: string) => void, signal?: AbortSignal,
): Promise<string> {
  let out = "";
  if (PROVIDER === "anthropic") {
    const client = new Anthropic();
    const rs = client.messages.stream({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }, { signal });
    for await (const ev of rs) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { out += ev.delta.text; onText(ev.delta.text); }
    }
    return out;
  }

  const res = await openaiFetch({ model, max_tokens: outputTokens(maxTokens), stream: true, messages: [{ role: "user", content: prompt }] }, signal);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (data === "[DONE]") return out;
      try {
        const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (delta) { out += delta; onText(delta); }
      } catch { /* keep-alive or partial line */ }
    }
  }
  return out;
}

async function openaiFetch(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const base = apiBase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  if (base.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "AEO Section Writer";
  }
  const res = await fetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err: LlmError = new Error(`LLM API error ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res;
}
