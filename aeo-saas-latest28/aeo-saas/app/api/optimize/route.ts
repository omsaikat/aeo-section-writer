import { changePercent } from "@/lib/diff";
import {
  dataForSeoConfigured, googleAnswers, llmAnswer, relatedKeywords,
  type EngineAnswer, type Keyword,
} from "@/lib/dataforseo";
import { FAST_MODEL, MODEL, complete, llmConfigError } from "@/lib/llm";
import { MARKETS, detectLanguage, languageName } from "@/lib/markets";
import { analysisPrompt, parseJson, proposalPrompt, type Analysis, type HeadingMode, type Proposal } from "@/lib/prompts";
import { rebuild, segment } from "@/lib/segment";
import { adminSupabase } from "@/lib/supabase/admin";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import { mentions, sourcesFor } from "@/lib/sources";

export const runtime = "nodejs";
export const maxDuration = 300;

// Internal edit limit. Not exposed to users or sent to the browser.
const MAX_CHANGE = Number(process.env.MAX_CHANGE_PERCENT ?? 40);
const WRITE_TARGET = Math.max(8, MAX_CHANGE - 7);
const LLM_ENGINES = (process.env.DFS_LLM_ENGINES ?? "chat_gpt,perplexity")
  .split(",").map((s) => s.trim()).filter((s): s is "chat_gpt" | "perplexity" => s === "chat_gpt" || s === "perplexity");

type Body = {
  section?: string; brand?: string; website?: string; marketCode?: number; language?: string;
  headingMode?: HeadingMode; confirmed?: string[];
};

function hostOf(site: string): string {
  try { return new URL(/^https?:/.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}
const norm = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
// Engine failures are logged in full on the server. The browser gets a short reason the site owner can act on,
// without provider details such as balances.
const errText = (e: any) => {
  const m = String(e?.message ?? e ?? "");
  console.error("engine failed:", m);
  if (/login or password|HTTP 401|4010\d|unauthori|not authori/i.test(m)) return "Unavailable: DataForSEO rejected the API login or password.";
  if (/payment|balance|funds|4020\d/i.test(m)) return "Unavailable: the DataForSEO account needs a top-up.";
  if (/HTTP 403|4030\d|forbidden|not allowed|access denied/i.test(m) || /\bIP\b/.test(m)) return "Unavailable: DataForSEO blocked this request (check IP whitelist or API access).";
  if (/abort|timeout|timed out/i.test(m)) return "Unavailable: DataForSEO took too long to answer.";
  if (/fetch failed|ENOTFOUND|ECONN|network/i.test(m)) return "Unavailable: couldn't reach DataForSEO.";
  // Anything else: pass DataForSEO's own short message on (amounts removed), so the cause can be fixed.
  const said = m.replace(/^DataForSEO\s*\d*:?\s*/i, "").replace(/\d+\.\d+/g, "#").slice(0, 140);
  return said ? `Unavailable: DataForSEO said "${said}".` : "This engine was unavailable for this run.";
};
const userError = (m: string) => Object.assign(new Error(m), { userMessage: m });

export async function POST(req: Request) {
  // Signed-in users only (local dev mode without Supabase skips this).
  let userId: string | null = null;
  if (authEnabled()) {
    const { user } = await currentUser();
    if (!user) return Response.json({ error: "Sign in to optimise sections." }, { status: 401 });
    userId = user.id;
  }
  const cfgErr = llmConfigError();
  if (cfgErr) return Response.json({ error: cfgErr }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }

  const section = (body.section ?? "").trim();
  if (section.length < 40) return Response.json({ error: "Paste a section of at least a few sentences." }, { status: 400 });
  if (section.length > 20000) return Response.json({ error: "That section is over 20,000 characters. Optimise one section at a time." }, { status: 400 });
  const seg = segment(section);
  if (seg.rows.length > 150) return Response.json({ error: "That section has too many lines. Optimise one section at a time." }, { status: 400 });

  const market = MARKETS.find((m) => m.code === Number(body.marketCode)) ?? MARKETS[0];
  const langCode = !body.language || body.language === "auto" ? detectLanguage(section, market) : body.language;
  const language = languageName(langCode);
  const brand = norm(body.brand).slice(0, 120);
  const website = norm(body.website).slice(0, 200);
  const siteHost = hostOf(website);
  const headingMode: HeadingMode = body.headingMode === "optimise" ? "optimise" : "keep";
  const confirmed = Array.isArray(body.confirmed) ? body.confirmed.map(norm).filter(Boolean).slice(0, 20) : [];

  // Take one credit up front; it is refunded if the run fails.
  const admin = userId ? adminSupabase() : null;
  let creditsLeft: number | null = null;
  if (admin && userId) {
    const { data, error } = await admin.rpc("consume_credit", { p_user: userId });
    if (error) return Response.json({ error: "Couldn't check your credits. Try again." }, { status: 500 });
    if (data === -1) return Response.json({ error: "You don't have any credits left. Choose a plan to continue.", code: "no_credits" }, { status: 402 });
    if (data === -2) return Response.json({ error: "Daily limit reached for your plan. Try again tomorrow.", code: "daily_cap" }, { status: 429 });
    creditsLeft = data as number;
  }
  const refund = async () => { if (admin && userId) await admin.rpc("refund_credit", { p_user: userId }); };

  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); } catch { /* client gone */ }
      };

      try {
        // 1. Primary query and fan-out
        send({ type: "status", message: "Analysing search queries and intent…" });
        const analysis = parseJson<Analysis>(await complete(FAST_MODEL, analysisPrompt(section, language, market.name), 1500, signal));
        if (!analysis?.primary_query) throw userError("Could not analyse this section. Try again.");
        analysis.fanout = Array.isArray(analysis.fanout) ? analysis.fanout.slice(0, 10) : [];
        analysis.entities = Array.isArray(analysis.entities) ? analysis.entities.slice(0, 10) : [];
        send({ type: "analysis", analysis, language, market: market.name });

        // The section's own heading is what the page should rank for, so it is the query sent to the engines.
        const headingRow = seg.rows.find((r) => r.type === "heading");
        const headingQuery = headingRow
          ? headingRow.text.replace(/<[^>]+>/g, "").replace(/^#{1,6}\s+/, "").replace(/\s+/g, " ").trim()
          : "";
        const searchQuery = headingQuery || analysis.primary_query;

        // 2. Real answers: Google AI Overview, voice results (snippet + PAA), ChatGPT, Perplexity
        const engines: EngineAnswer[] = [];
        let keywords: Keyword[] = [];
        const notes: string[] = [];
        let degraded = false;
        if (dataForSeoConfigured()) {
          send({ type: "status", message: "Asking Google, ChatGPT and Perplexity…" });
          const q = searchQuery;
          const [g0, k, ...llms] = await Promise.allSettled([
            googleAnswers(q, market.code, langCode, signal),
            relatedKeywords(analysis.seed_keyword || q, market.code, langCode, signal),
            ...LLM_ENGINES.map((p) => llmAnswer(p, q, market.iso, signal)),
          ]);
          // Short heading queries often get no AI Overview; then also try the question-style primary query.
          let g = g0;
          if (g.status === "fulfilled" && !g.value.aio.present && headingQuery
              && analysis.primary_query.toLowerCase() !== headingQuery.toLowerCase()) {
            const g2 = await Promise.allSettled([googleAnswers(analysis.primary_query, market.code, langCode, signal)]);
            if (g2[0].status === "fulfilled" && g2[0].value.aio.present) {
              g = { status: "fulfilled", value: { aio: { ...g2[0].value.aio, query: analysis.primary_query }, voice: g.value.voice } };
            }
          }
          if (g.status === "fulfilled") engines.push(g.value.aio, g.value.voice);
          else engines.push(
            { engine: "Google AIO", present: false, text: "", sources: [], error: errText(g.reason) },
            { engine: "Voice", present: false, text: "", sources: [], error: errText(g.reason) },
          );
          llms.forEach((r, i) => {
            const engine = LLM_ENGINES[i] === "chat_gpt" ? "ChatGPT" : "Perplexity";
            if (r.status === "fulfilled") engines.push(r.value as EngineAnswer);
            else engines.push({ engine, present: false, text: "", sources: [], error: errText(r.reason) });
          });
          if (k.status === "fulfilled") keywords = k.value as Keyword[];
          if (engines.every((e) => e.error)) {
            degraded = true;
            notes.push("Live answers from Google, ChatGPT and Perplexity were unavailable for this run, so AEO keys come from query analysis only. This run was not charged.");
          }
        } else {
          notes.push("DataForSEO is not configured, so no live engine answers were fetched. AEO keys come from query analysis only.");
        }
        send({
          type: "engines",
          query: searchQuery,
          engines: engines.map((e) => ({
            ...e, text: e.text.slice(0, 1500),
            cited: siteHost && e.present ? e.sources.some((s) => s.domain.endsWith(siteHost)) : null,
          })),
          notes,
        });

        // 3. AEO keys and the line-by-line proposal
        send({ type: "status", message: "Finding AEO keys and editing lines…" });
        const prompt = proposalPrompt({
          rows: seg.rows, language, market: market.name, brand, website, analysis,
          engines, keywords, confirmed, targetPercent: WRITE_TARGET, headingMode,
        });
        // One retry if the answer isn't valid JSON (rare, but costs the user a failed run otherwise).
        let proposal = parseJson<Proposal>(await complete(MODEL, prompt, 16000, signal));
        if ((!proposal || !Array.isArray(proposal.rows)) && !signal.aborted) {
          proposal = parseJson<Proposal>(await complete(MODEL, prompt, 16000, signal));
        }
        if (!proposal || !Array.isArray(proposal.rows)) throw userError("The model's answer couldn't be read. Try again.");

        // 4. Verify sources in code, enforce headings and the change limit
        const labelFor = (key: string) => {
          const src = sourcesFor(key, engines);
          return src.length ? src : ["Query analysis"];
        };
        const byId = new Map(proposal.rows.map((r) => [Number(r.id), r]));
        const rows = seg.rows.map((r) => {
          const g = byId.get(r.id);
          let proposed = norm(g?.proposed) || r.text;
          if (r.type === "heading") {
            const q = /[?？؟]\s*(<\/h[1-6]>)?\s*$/i;
            if (headingMode === "keep" || (q.test(proposed) && !q.test(r.text))) proposed = r.text;
          }
          const changed = norm(proposed) !== norm(r.text);
          const keys = changed
            ? (Array.isArray(g?.aeo_keys) ? g!.aeo_keys : []).map(norm).filter((k) => k && mentions(proposed, k)).slice(0, 3)
                .map((k) => ({ key: k, sources: labelFor(k) }))
            : [];
          return { ...r, proposed: changed ? proposed : r.text, changed, keys };
        });

        const original = rebuild(seg, (i) => seg.rows[i].text);
        const current = () => rebuild(seg, (i) => rows[i].proposed);
        let pct = changePercent(original, current());
        if (pct !== null && pct > MAX_CHANGE) {
          const firstText = rows.find((r) => r.type === "text")?.id;
          const order = rows.filter((r) => r.changed && r.id !== firstText)
            .map((r) => ({ r, c: changePercent(r.text, r.proposed) ?? 0 })).sort((a, b) => b.c - a.c);
          // The first sentence is reverted last, only if the limit still isn't met without it.
          const first = rows.find((r) => r.id === firstText && r.changed);
          for (const r of [...order.map((o) => o.r), ...(first ? [first] : [])]) {
            if (pct !== null && pct <= MAX_CHANGE) break;
            r.proposed = r.text; r.changed = false; r.keys = [];
            pct = changePercent(original, current());
          }
        }

        const usedKeys = new Set(rows.flatMap((r) => r.keys.map((k) => k.key.toLowerCase())));
        const weight = (s: string[]) => (s[0] === "Query analysis" ? 0 : s.length + (s.includes("Google AIO") ? 0.5 : 0));
        const keys = (Array.isArray(proposal.keys) ? proposal.keys : [])
          .map((k) => ({ key: norm(k?.key), supported: Boolean(k?.supported) }))
          .filter((k) => k.key && !mentions(section, k.key))
          .map((k) => ({ ...k, sources: labelFor(k.key), used: usedKeys.has(k.key.toLowerCase()) }))
          .sort((a, b) => weight(b.sources) - weight(a.sources));
        const toConfirm = keys.filter((k) => !k.supported && !confirmed.some((c) => c.toLowerCase() === k.key.toLowerCase()));

        const output = current();
        let savedId: string | null = null;
        if (admin && userId) {
          const { data } = await admin.from("optimizations").insert({
            user_id: userId, heading: headingQuery || null, search_query: searchQuery, market: market.name, language,
            input: section, output, rows, keys, engines: engines.map((e) => ({ ...e, text: e.text.slice(0, 1500) })),
          }).select("id").single();
          savedId = data?.id ?? null;
        }
        // No live engine data at all: the user still gets the edit, but the credit goes back.
        if (degraded && admin && userId) { await refund(); if (creditsLeft !== null) creditsLeft += 1; }
        send({ type: "final", rows, keys, toConfirm, content: output, savedId, creditsLeft });
      } catch (err: any) {
        await refund();
        if (signal.aborted) { controller.close(); return; }
        const status = err?.status;
        console.error("optimize failed:", err);
        // Provider error bodies stay in the server log; users see a plain message and get their credit back.
        const message =
          status === 401 || status === 403 ? "The AI service rejected our request. Please contact support."
          : status === 429 ? "Too many requests right now. Wait a minute and try again."
          : status === 529 || status === 503 || status === 500 ? "The AI model is busy right now. Try again shortly."
          : status ? "The AI service returned an error. Try again."
          : err?.userMessage || "Something went wrong. Try again.";
        send({ type: "error", message: admin && userId ? `${message} Your credit was not used.` : message });
        controller.close();
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
