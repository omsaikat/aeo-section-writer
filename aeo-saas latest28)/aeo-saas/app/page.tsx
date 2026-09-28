import Link from "next/link";
import ResultTable, { type SavedRow } from "@/components/ResultTable";
import { PLANS } from "@/lib/plans";

const EXAMPLE: SavedRow[] = [
  { id: 1, type: "heading", label: "Heading", text: "Chic Concealed Carry Crossbody Bags", proposed: "Chic Concealed Carry Crossbody Bags", changed: false, keys: [] },
  {
    id: 2, type: "text", label: "1", changed: true,
    text: "We've designed a line of concealed pistol purses that perfectly blends form and function.",
    proposed: "We've designed a line of concealed pistol purses that blend form and function, with a dedicated firearm compartment for secure, discreet carry.",
    keys: [{ key: "dedicated firearm compartment", sources: ["Google AIO", "Voice", "ChatGPT"] }],
  },
  {
    id: 3, type: "text", label: "2", changed: false,
    text: "Our discreet styling blends in with your attire.", proposed: "Our discreet styling blends in with your attire.", keys: [],
  },
];

const FAQ: [string, string][] = [
  ["Where do the AEO keys come from?", "We send your section's heading to Google (AI Overview, featured snippet and People also ask), ChatGPT and Perplexity through DataForSEO, and read their real answers. The source labels under each key are checked against those answers in code, not guessed by AI."],
  ["Will it rewrite my whole page?", "No. It edits one section at a time and changes only a small share of the wording. Your headings stay as written unless you allow keyword improvements, and it never turns them into questions."],
  ["Can it add features my product doesn't have?", "No. When engines mention something your copy doesn't claim, such as a locking zipper, it goes to a Confirm before adding list. It is only used after you tick it."],
  ["Does it guarantee a place in AI Overviews?", "No tool can. Google, ChatGPT and Perplexity decide what to quote. The tool shows what they say today, whether your site is cited, and makes your copy easier for them to use."],
  ["Is there a free trial?", "No. Every run asks Google, ChatGPT and Perplexity for live answers, which costs us per request, so all plans are paid. Start with Starter if you want to try it on one website."],
  ["Which languages work?", "Any language. The interface is in English; your section is edited in its own language."],
];

export default function Landing() {
  return (
    <main className="wrap landing">
      <section className="hero big">
        <h1>See what AI engines say about your page, then make your copy the answer</h1>
        <p className="sub">
          Paste a section. We ask Google AI Overview, ChatGPT and Perplexity about its heading, find the terms they use that your copy
          is missing, and propose light, line-by-line edits your team can review and paste back.
        </p>
        <div className="cta">
          <Link href="#pricing" className="button primary">See plans</Link>
          <Link href="#how" className="button">How it works</Link>
        </div>
      </section>

      <section className="results">
        <header><h2>What you get</h2><span className="tag ex">Example</span></header>
        <ResultTable rows={EXAMPLE} />
      </section>

      <section id="how" className="steps">
        <div className="step"><span className="stepn">1</span><h3>Paste a section</h3><p>A heading and its paragraphs, in plain text, markdown or HTML, in any language.</p></div>
        <div className="step"><span className="stepn">2</span><h3>We ask the engines</h3><p>Google AI Overview, voice results, ChatGPT and Perplexity answer your heading. You see who they cite.</p></div>
        <div className="step"><span className="stepn">3</span><h3>Review line by line</h3><p>Each changed line shows the AEO key it adds and which engines use it. Copy the table into Sheets or the text into your CMS.</p></div>
      </section>

      <section id="pricing" className="plans">
        {PLANS.map((p) => (
          <div key={p.id} className={`plan ${p.id === "pro" ? "featured" : ""}`}>
            <h3>{p.name}</h3>
            <p className="price">৳{p.priceBdt.toLocaleString("en-US")}<span>/30 days</span></p>
            <ul><li>{p.credits.toLocaleString("en-US")} sections</li><li>All four answer engines</li><li>History and table export</li></ul>
            <p className="muted small-text">{p.blurb}</p>
            <Link href="/login?next=/billing" className={`button ${p.id === "pro" ? "primary" : ""}`}>Choose {p.name}</Link>
          </div>
        ))}
      </section>
      <p className="note center">Pay with bKash, Nagad, Rocket or card. Prices in Bangladeshi taka.</p>

      <section className="faq">
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </section>

      <footer className="foot">© {new Date().getFullYear()} AEO Section Writer. Google, ChatGPT and Perplexity are trademarks of their owners; this product is not affiliated with them.</footer>
    </main>
  );
}
