import Link from "next/link";
import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!authEnabled()) redirect("/optimize");
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/history");
  const { data: items } = await supabase
    .from("optimizations")
    .select("id, created_at, heading, search_query, market, rows")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="wrap">
      <header className="hero compact"><h1>History</h1><p className="sub">Your last 100 optimised sections.</p></header>
      {!items?.length ? (
        <section className="card"><p style={{ margin: 0 }}>Nothing yet. <Link href="/optimize">Optimise your first section</Link>.</p></section>
      ) : (
        <section className="results">
          <div className="rt-wrap">
            <table className="list">
              <thead><tr><th>Section</th><th>Market</th><th className="num">Lines improved</th><th>Date</th></tr></thead>
              <tbody>
                {items.map((it) => {
                  const rows = (it.rows as { type: string; changed: boolean }[]) ?? [];
                  const text = rows.filter((r) => r.type === "text");
                  return (
                    <tr key={it.id}>
                      <td><Link href={`/history/${it.id}`}>{it.heading || it.search_query || "Untitled section"}</Link></td>
                      <td>{it.market}</td>
                      <td className="num">{text.filter((r) => r.changed).length} / {text.length}</td>
                      <td>{new Date(it.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
