"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { diffOps } from "@/lib/diff";
import { LANGUAGES, MARKETS } from "@/lib/markets";

const APP_NAME = "AEO Section Writer";
const SETTINGS_KEY = "aeo-section-writer.settings.v1";

type HeadingMode = "keep" | "optimise";
type Source = { domain: string; url: string; title: string };
type Engine = { engine: string; present: boolean; text: string; sources: Source[]; cited: boolean | null; error?: string; query?: string };
type KeyRef = { key: string; sources: string[] };
type Row = { id: number; type: "heading" | "text"; label: string; text: string; proposed: string; changed: boolean; keys: KeyRef[] };
type KeyInfo = KeyRef & { supported: boolean; used: boolean };
type Analysis = { primary_query: string; fanout: { query: string; intent: string }[] };
type Settings = { brand: string; website: string; marketCode: number; language: string; headingMode: HeadingMode };

const DEFAULTS: Settings = { brand: "", website: "", marketCode: 2840, language: "auto", headingMode: "keep" };
const ENGINE_NAME: Record<string, string> = { "Google AIO": "Google AI Overview", Voice: "Voice (featured snippet)", ChatGPT: "ChatGPT", Perplexity: "Perplexity" };
const SOURCE_SHORT: Record<string, string> = { "Google AIO": "AIO", Voice: "Voice", ChatGPT: "ChatGPT", Perplexity: "Perplexity", "Query analysis": "Query analysis" };

const SAMPLE = `Chic Concealed Carry Crossbody Bags

An important part of the Cakes Concealed Carry™ mission is to go beyond function and ensure you also have a fashionable conceal-and-carry crossbody bag. We've designed a line of concealed pistol purses that perfectly blends form and function. Our discreet styling blends in with your attire and ensures nobody will suspect that you have a concealed carry women's bag.`;

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Proposed line with inserted keys underlined and [placeholders] marked. */
function Marked({ text, keys }: { text: string; keys: string[] }) {
  const parts = keys.filter((k) => k.length > 1).sort((a, b) => b.length - a.length);
  const re = parts.length ? new RegExp(`(${parts.map(reEsc).join("|")}|\\[[^\\]\\n]{2,60}\\])`, "gi") : /(\[[^\]\n]{2,60}\])/g;
  return <>{text.split(re).map((p, i) =>
    /^\[[^\]]+\]$/.test(p) ? <span key={i} className="ph">{p}</span>
    : parts.some((k) => k.toLowerCase() === p.toLowerCase()) ? <mark key={i}>{p}</mark>
    : <Fragment key={i}>{p}</Fragment>)}</>;
}

function Sources({ list }: { list: string[] }) {
  return <span className="srcs">{list.map((s) => <span key={s} className={`src ${s === "Query analysis" ? "weak" : ""}`}>{SOURCE_SHORT[s] ?? s}</span>)}</span>;
}

export default function Tool({ initialCredits }: { initialCredits: number | null }) {
  const [section, setSection] = useState(SAMPLE);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [credits, setCredits] = useState<number | null>(initialCredits);
  const [outOfCredits, setOutOfCredits] = useState(false);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [keys, setKeys] = useState<KeyInfo[]>([]);
  const [toConfirm, setToConfirm] = useState<KeyInfo[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [engineQuery, setEngineQuery] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [view, setView] = useState<"table" | "clean" | "diff">("table");
  const [copied, setCopied] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); if (saved) setSettings({ ...DEFAULTS, ...saved }); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } }, [settings]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const words = section.split(/\s+/).filter(Boolean).length;
  const ops = useMemo(() => (!running && view === "diff" && content ? diffOps(original, content) : null), [running, view, original, content]);
  const textRows = rows?.filter((r) => r.type === "text") ?? [];
  const improved = textRows.filter((r) => r.changed).length;

  async function run(e?: React.FormEvent, confirmedFacts: string[] = []) {
    e?.preventDefault();
    if (running || words < 8) return;
    setError(""); setOutOfCredits(false); setSavedId(null); setRows(null); setContent(""); setKeys([]); setToConfirm([]); setEngines([]); setAnalysis(null); setEngineQuery(""); setNotes([]);
    setOriginal(section.trim()); setConfirmed(confirmedFacts);
    setRunning(true); setStatus("Starting…");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, ...settings, confirmed: confirmedFacts }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) { window.location.href = "/login?next=/optimize"; return; }
        if (res.status === 402) setOutOfCredits(true);
        throw new Error(j.error || `Request failed (${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") setStatus(ev.message);
          else if (ev.type === "analysis") setAnalysis(ev.analysis);
          else if (ev.type === "engines") { setEngines(ev.engines ?? []); setNotes(ev.notes ?? []); setEngineQuery(ev.query ?? ""); }
          else if (ev.type === "final") { finished = true; setRows(ev.rows); setKeys(ev.keys ?? []); setToConfirm(ev.toConfirm ?? []); setContent(ev.content); setStatus(""); if (typeof ev.creditsLeft === "number") setCredits(ev.creditsLeft); if (ev.savedId) setSavedId(ev.savedId); }
          else if (ev.type === "error") throw new Error(ev.message);
        }
      }
      // The connection closed without a result (network drop or server time limit).
      if (!finished) throw new Error("The run was interrupted before it finished. Try again; if a credit was used, contact support.");
    } catch (err: any) {
      if (err?.name === "AbortError") setStatus("Stopped.");
      else { setError(err?.message || "Something went wrong."); setStatus(""); }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  async function copy(kind: "text" | "table") {
    if (!rows) return;
    try {
      if (kind === "text") await navigator.clipboard.writeText(content);
      else {
        const head = ["#", "Old Content Line Text", "AEO Key", "Sources", "Proposed Content Line Text"];
        const data = rows.map((r) => [r.label, r.text, r.keys.map((k) => k.key).join(", ") || "—",
          [...new Set(r.keys.flatMap((k) => k.sources))].join(", ") || "—", r.proposed]);
        const tsv = [head, ...data].map((c) => c.map((x) => String(x).replace(/[\t\n]/g, " ")).join("\t")).join("\n");
        const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
        const html = `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${data.map((d, i) =>
          `<tr>${d.map((x, j) => `<td${j === 4 && rows[i].changed ? ' style="font-weight:bold"' : ""}>${esc(String(x))}</td>`).join("")}</tr>`).join("")}</table>`;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]);
        } catch { await navigator.clipboard.writeText(tsv); }
      }
      setCopied(kind); setTimeout(() => setCopied(""), 1600);
    } catch { setError("Copy failed. Select the text and press Ctrl+C."); }
  }

  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked([]), [toConfirm]);
  const togglePick = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const siteHost = settings.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); formRef.current?.requestSubmit(); }
  };

  return (
    <>
      <main className="wrap" onKeyDown={onKeyDown}>
        <header className="hero compact">
          <h1>Optimise a section</h1>
          <p className="sub">Paste one section. We check what Google AI Overview, ChatGPT and Perplexity say about its heading and propose light, line-by-line edits.</p>
        </header>

        {credits === 0 && (
          <p className="banner info">You don&apos;t have any credits. <a href="/billing">Choose a plan</a> to start optimising.</p>
        )}

        <form ref={formRef} className="opts" onSubmit={(e) => run(e, [])} autoComplete="off">
          <div className="f"><label htmlFor="brand">Brand name</label>
            <input id="brand" value={settings.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Cakes Concealed Carry" /></div>
          <div className="f"><label htmlFor="website">Website</label>
            <input id="website" value={settings.website} onChange={(e) => set("website", e.target.value)} placeholder="example.com" /></div>
          <div className="f"><label htmlFor="market">Target market</label>
            <select id="market" value={settings.marketCode} onChange={(e) => set("marketCode", Number(e.target.value))}>
              {MARKETS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
            </select></div>
          <div className="f"><label htmlFor="language">Content language</label>
            <select id="language" value={settings.language} onChange={(e) => set("language", e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select></div>
          <div className="f span2"><label htmlFor="headings">Headings</label>
            <select id="headings" value={settings.headingMode} onChange={(e) => set("headingMode", e.target.value as HeadingMode)}>
              <option value="keep">Keep headings unchanged</option>
              <option value="optimise">Optimise headings (add keyword)</option>
            </select></div>
          <div className="actions">
            {credits !== null && (
              <span className={`credits ${credits <= 3 ? "low" : ""}`}>{credits} credit{credits === 1 ? "" : "s"} left · <a href="/billing">Upgrade</a></span>
            )}
            <span className="hint">Ctrl + Enter</span>
            {running && <button type="button" onClick={() => abortRef.current?.abort()}>Stop</button>}
            <button type="submit" className="primary" disabled={running || words < 8 || credits === 0}>{running ? "Working…" : "Optimise section"}</button>
          </div>
        </form>

        <section className="card-in">
          <header>
            <h2>Original section</h2>
            <span className="muted small-text">{words} words</span>
            <button type="button" className="ghost" onClick={() => setSection(SAMPLE)} disabled={running}>Example</button>
            <button type="button" className="ghost" onClick={() => setSection("")} disabled={running || !section}>Clear</button>
          </header>
          <textarea aria-label="Original section" value={section} onChange={(e) => setSection(e.target.value)}
            placeholder="Paste one section of your page: its heading and paragraphs. Plain text, markdown or HTML." />
        </section>

        <section className="results">
          <header>
            <h2>Line-by-line proposal</h2>
            {rows && <span className="tag ok">{improved} of {textRows.length} lines improved</span>}
            {rows && confirmed.length > 0 && <span className="tag">{confirmed.length} confirmed feature{confirmed.length > 1 ? "s" : ""} used</span>}
            <div className="toggle" role="group" aria-label="View">
              {(["table", "clean", "diff"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === "table" ? "Table" : v === "clean" ? "Clean text" : "Show changes"}</button>
              ))}
            </div>
          </header>

          {!rows && (
            <div className="empty">
              {running ? <span className="pulse">{status}</span> : <>
                <strong>Your line-by-line proposal appears here.</strong>
                <span>Each changed line shows the AEO key it adds and which engines use it.</span>
              </>}
            </div>
          )}

          {rows && view === "table" && (
            <div className="rt-wrap">
              <table className="rt">
                <colgroup><col className="n" /><col /><col className="k" /><col /></colgroup>
                <thead><tr><th>#</th><th>Old content line</th><th className="c">AEO key</th><th>Proposed content line</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`${r.type === "heading" ? "hrow " : ""}${r.changed ? "chg" : "same"}`}>
                      <td className="n">{r.label}</td>
                      <td data-label="Old content line">{r.text}</td>
                      <td className="key" data-label="AEO key">
                        {r.changed && r.keys.length ? r.keys.map((k) => (
                          <div key={k.key} className="keyline"><span className="kchip">{k.key}</span><Sources list={k.sources} /></div>
                        )) : <span className="dash">—</span>}
                      </td>
                      <td className="prop" data-label="Proposed content line">{r.changed ? <Marked text={r.proposed} keys={r.keys.map((k) => k.key)} /> : r.proposed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && view === "clean" && <div className="plain"><Marked text={content} keys={[]} /></div>}
          {rows && view === "diff" && (
            <div className="plain">{ops ? ops.map((o, i) => o.op === "=" ? <span key={i}>{o.text}</span> : o.op === "+" ? <ins key={i}>{o.text}</ins> : <del key={i}>{o.text}</del>) : content}</div>
          )}
        </section>

        <div className="bar">
          {view === "diff" && rows && <span className="legend note" style={{ margin: 0 }}><ins>added</ins> · <del>removed</del></span>}
          {error ? <span className="status err">{error}{outOfCredits && <> <a href="/billing">See plans</a></>}</span> : !running && status && <span className="status">{status}</span>}
          {savedId && !running && <a className="status" href={`/history/${savedId}`}>Saved to history</a>}
          <span className="sp" />
          <button type="button" className="small" onClick={() => copy("table")} disabled={!rows || running}>{copied === "table" ? "Copied" : "Copy table"}</button>
          <button type="button" className="small" onClick={() => copy("text")} disabled={!rows || running}>{copied === "text" ? "Copied" : "Copy optimised text"}</button>
        </div>

        {toConfirm.length > 0 && !running && (
          <section className="card confirm">
            <h3>Confirm before adding</h3>
            <p className="note" style={{ marginTop: 0 }}>Answer engines mention these, but your section doesn&apos;t say your product has them. Tick only what is true, then re-run to work them in.</p>
            <div className="confirm-list">
              {toConfirm.map((k) => (
                <label key={k.key} className="check">
                  <input type="checkbox" checked={picked.includes(k.key)} onChange={() => togglePick(k.key)} />
                  <span>{k.key}</span><Sources list={k.sources} />
                </label>
              ))}
            </div>
            <button type="button" className="primary small" disabled={!picked.length} onClick={() => run(undefined, [...confirmed, ...picked])}>
              Re-run with {picked.length || "the"} confirmed feature{picked.length === 1 ? "" : "s"}
            </button>
          </section>
        )}

        {(engines.length > 0 || analysis) && (
          <section className="card">
            <h3>What answer engines say today</h3>
            {(engineQuery || analysis) && <p className="primary-q">Searched for: “{engineQuery || analysis?.primary_query}”</p>}
            <div className="engines">
              {engines.map((e) => (
                <details key={e.engine} className="engine">
                  <summary>
                    <span className="ename">{ENGINE_NAME[e.engine] ?? e.engine}</span>
                    {e.present ? <span className="pill yes">answer found</span> : <span className="pill no">{e.error ? "unavailable" : "no answer"}</span>}
                    {siteHost && e.cited !== null && <span className={`pill ${e.cited ? "yes" : "no"}`}>{e.cited ? `${siteHost} cited` : `${siteHost} not cited`}</span>}
                  </summary>
                  {e.query && <p className="note">No AI Overview for the heading, so this is Google&apos;s answer for “{e.query}”.</p>}
                  {e.present && <div className="aio-text">{e.text}</div>}
                  {e.sources.length > 0 && (
                    <ol className="sources">
                      {e.sources.slice(0, 6).map((s) => (
                        <li key={s.url} className={siteHost && s.domain.endsWith(siteHost) ? "me" : ""}><a href={s.url} target="_blank" rel="noreferrer">{s.domain}</a></li>
                      ))}
                    </ol>
                  )}
                  {e.error && <p className="note">{e.error}</p>}
                </details>
              ))}
            </div>
            {keys.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>All AEO keys found</h3>
                <div className="chips">
                  {keys.map((k) => (
                    <span key={k.key} className={`chip ${k.used ? "used" : ""}`} title={k.used ? "Used in the proposal" : k.supported ? "Not placed" : "Needs confirmation"}>
                      {k.key}<Sources list={k.sources} />
                    </span>
                  ))}
                </div>
              </>
            )}
            {notes.length > 0 && <p className="note">{notes.join(" · ")}</p>}
          </section>
        )}

        <footer className="foot">
          Sources next to each AEO key are checked against the engines&apos; actual answers. &quot;Query analysis&quot; means no engine answer contained the term.{" "}
          {APP_NAME} never adds claims about your product unless you confirm them.
        </footer>
      </main>
    </>
  );
}
