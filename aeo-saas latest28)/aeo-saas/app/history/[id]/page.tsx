import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ResultTable, { type SavedRow } from "@/components/ResultTable";
import CopyButtons from "@/components/CopyButtons";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SavedRun({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!authEnabled()) redirect("/optimize");
  const { supabase, user } = await currentUser();
  if (!user) redirect(`/login?next=/history/${id}`);
  const { data: it } = await supabase.from("optimizations").select("*").eq("id", id).single();
  if (!it) notFound();
  const rows = it.rows as SavedRow[];
  const engines = (it.engines as { engine: string; present: boolean; sources: { domain: string }[] }[]) ?? [];

  return (
    <main className="wrap">
      <header className="hero compact">
        <p className="crumbs"><Link href="/history">History</Link> /</p>
        <h1>{it.heading || it.search_query || "Optimised section"}</h1>
        <p className="sub">
          {new Date(it.created_at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} · {it.market} · {it.language}
          {it.search_query ? <> · searched for “{it.search_query}”</> : null}
        </p>
      </header>
      <section className="results">
        <header><h2>Line-by-line proposal</h2><CopyButtons rows={rows} content={it.output} /></header>
        <ResultTable rows={rows} />
      </section>
      {engines.length > 0 && (
        <section className="card">
          <h3>Answer engines at the time of this run</h3>
          <div className="pills">
            {engines.map((e) => <span key={e.engine} className={`pill ${e.present ? "yes" : "no"}`}>{e.engine === "Google AIO" ? "Google AI Overview" : e.engine}: {e.present ? `${e.sources.length} sources` : "no answer"}</span>)}
          </div>
        </section>
      )}
    </main>
  );
}
