# AEO Section Writer

Paste any website section → the app asks Google AI Overview, ChatGPT and Perplexity the question the section
should answer (via DataForSEO), finds the terms they use that the copy is missing (AEO keys), and proposes
light, line-by-line edits. Interface in English; content in any language.


## How one run works

1. **Query analysis** (`LLM_FAST_MODEL`): primary query, seed keyword and fan-out sub-queries with intent.
2. **Real engine answers** for the primary query (DataForSEO, cached 7 days in memory):
   - **Google AI Overview**: SERP `google/organic/live/advanced` with `load_async_ai_overview`
   - **Voice**: the featured snippet and "People also ask" answers from the same SERP (what voice assistants usually read out)
   - **ChatGPT** and **Perplexity**: AI Optimization `llm_responses/live` (web search on), with cited sources
   - Keyword volume and intent: Labs `related_keywords/live`
3. **AEO keys + line-by-line proposal** (`LLM_MODEL`): the section is split into rows (one per heading and sentence).
   The model lists the terms the engines use that the section lacks, marks each as *supported* (already true per the
   section) or *needs confirmation* (a new product claim), and edits rows using supported keys only.
4. **Verification in code**:
   - The source labels under each AEO key (AIO, Voice, ChatGPT, Perplexity) are computed by checking the engines'
     actual answer text, never taken from the model. A key found in no answer is labelled "Query analysis".
   - Keys the model lists for a row must actually appear in the proposed line.
   - Headings are restored (Keep mode) or never turned into questions (Optimise mode).
   - The internal change limit (`MAX_CHANGE_PERCENT`, default 40, never shown to users) is enforced by reverting the
     heaviest row edits first, keeping the first sentence.
5. **Confirm before adding**: new-claim keys are listed for the user; ticked ones are sent back as confirmed facts on re-run.

Output: a table (#, Old content line, AEO key with sources, Proposed content line), clean text, a diff view,
Copy table (pastes into Google Sheets / Excel with formatting) and the raw engine answers with "your site cited" checks.

## Setup

```bash
cp .env.example .env.local   # fill in the keys
npm install
npm run dev                  # http://localhost:3000
```

| Variable | What it is |
|---|---|
| `LLM_PROVIDER` | `anthropic` (default) or `openai` for any OpenAI-compatible API |
| `ANTHROPIC_API_KEY` | Claude API key from platform.claude.com (when `LLM_PROVIDER=anthropic`) |
| `LLM_BASE_URL` / `LLM_API_KEY` | OpenAI-compatible endpoint and key: OpenAI, Gemini, OpenRouter, Groq, DeepSeek, Ollama… (see `.env.example`) |
| `LLM_MODEL` | Rewrite model (default `claude-opus-5-5`) |
| `LLM_FAST_MODEL` | Analysis model (defaults to `LLM_MODEL`) |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | From app.dataforseo.com → API Access. Without them the app still runs on query analysis only. |
| `MAX_CHANGE_PERCENT` | Internal change limit, default 40 (not shown to users) |
| `DFS_LLM_ENGINES` | `chat_gpt,perplexity` by default; empty to skip LLM answers |
| `DFS_CHATGPT_MODEL` / `DFS_PERPLEXITY_MODEL` | Models DataForSEO uses (defaults `gpt-4.1-mini`, `sonar`) |
| `DATAFORSEO_BASE_URL` | Optional override for testing against a mock server |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API. Empty = local dev mode (no login, no credits, nothing saved). |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` / `SSLCOMMERZ_LIVE` | From your SSLCommerz merchant panel. `false` uses the sandbox. |
| `APP_URL` | Public URL, e.g. `https://yourdomain.com` (payment and login redirects) |

## Accounts, credits and payments

1. **Supabase**: create a project, open *SQL Editor*, paste and run `supabase/schema.sql`.
   - *Authentication → Providers*: enable Email (magic link) and, optionally, Google.
   - *Authentication → URL Configuration*: set Site URL to `APP_URL` and add `APP_URL/auth/callback` to Redirect URLs.
2. **Plans** live in `lib/plans.ts` (Starter 70 / Pro 210 / Agency 700 sections per 30 days, with a daily cap).
   There is no free plan: new accounts start with 0 credits and must buy a plan; an expired plan drops back to 0.
   Buying again while a plan is active carries the unused credits over into the new 30-day period.
   Every run takes one credit before it starts (`consume_credit`, atomic in Postgres) and refunds it if the run fails,
   is stopped, or gets no live answer from any engine.
3. **SSLCommerz**: in the merchant panel set the IPN URL to `APP_URL/api/pay/ipn`.
   Flow: Billing → `/api/pay/init` creates a pending payment and redirects to the gateway →
   the customer returns to `/api/pay/return`, and SSLCommerz also calls `/api/pay/ipn` →
   both validate with the SSLCommerz validation API, check transaction id, amount and currency, and activate the plan once.
   If the validation API can't be reached, the payment stays pending and the IPN activates it later.
   Test in the sandbox first (`SSLCOMMERZ_LIVE=false`).

Pages: `/` landing + pricing · `/login` · `/optimize` the tool · `/history` saved runs · `/billing` plan, credits, payments.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. vercel.com → Add New → Project → import the repository.
3. Add the environment variables above → Deploy.
4. Commercial use needs the Vercel **Pro** plan. The API route sets `maxDuration = 300` seconds.

## Project layout

```
app/page.tsx               Landing page with pricing and FAQ
app/optimize/              The tool (Tool.tsx) behind login
app/history/, app/billing/ Saved runs; plan, credits and payments
app/login/, app/auth/      Magic-link / Google sign-in, callback, sign-out
app/api/pay/               SSLCommerz init, return and IPN
proxy.ts                   Refreshes the Supabase session cookie
supabase/schema.sql        Tables, row-level security, credit functions
lib/plans.ts, lib/payments.ts, lib/sslcommerz.ts, lib/supabase/
app/api/optimize/route.ts  Pipeline (analysis → engine answers → proposal → verification), NDJSON stream
lib/dataforseo.ts          DataForSEO: Google SERP (AIO, snippet, PAA), ChatGPT/Perplexity answers, keywords
lib/segment.ts             Split a section into heading/sentence rows and rebuild it
lib/sources.ts             Check which engines actually use a key
lib/llm.ts                 Provider switch: Anthropic SDK or any OpenAI-compatible API
lib/prompts.ts             All prompts
lib/diff.ts                Change % and word diff (shared by server and UI)
lib/markets.ts             Markets (location codes), languages, script-based language detection
lib/cache.ts               In-memory TTL cache
```

## Not included yet

- International cards in USD (Paddle / Stripe) — only SSLCommerz (BDT) is wired in
- Automatic monthly renewal (each purchase covers 30 days)
- Team seats and an admin dashboard

## Verify with a live key

- The `ai_overview` item shape: sources are collected from every `url` inside the item, so parsing tolerates
  schema changes, but confirm on a few real queries that the cited-site check matches what Google shows.
- DataForSEO Labs does not cover every location/language pair; unsupported pairs show a note and the run continues.
