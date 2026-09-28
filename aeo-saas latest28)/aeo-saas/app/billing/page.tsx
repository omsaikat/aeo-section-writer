import { redirect } from "next/navigation";
import { PLANS, planById } from "@/lib/plans";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import { sslConfigured } from "@/lib/sslcommerz";

export const dynamic = "force-dynamic";
const MSG: Record<string, [string, boolean]> = {
  success: ["Payment received. Your plan is active.", true],
  failed: ["The payment didn't go through. You haven't been charged for a plan.", false],
  cancelled: ["Payment cancelled.", false],
  pending: ["We're confirming your payment with the gateway. Your plan will switch on within a few minutes; refresh this page.", true],
};
const ERR: Record<string, string> = {
  not_configured: "Payments aren't set up on this server yet.",
  gateway: "The payment gateway couldn't start. Try again in a minute.",
  db: "Couldn't create the payment. Try again.",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (!authEnabled()) redirect("/optimize");
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/billing");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: payments } = await supabase.from("payments").select("tran_id, plan, amount, status, created_at").order("created_at", { ascending: false }).limit(10);
  const current = planById(profile?.plan);
  const active = Boolean(current && profile?.period_end && new Date(profile.period_end) > new Date());
  const msg = sp.payment ? MSG[sp.payment] : null;

  return (
    <main className="wrap">
      <header className="hero compact"><h1>Plan & billing</h1></header>
      {msg && <p className={`banner ${msg[1] ? "ok" : "bad"}`}>{msg[0]}</p>}
      {!active && !msg && <p className="banner info">Choose a plan to start optimising sections.</p>}
      {sp.error && <p className="banner bad">{ERR[sp.error] ?? "Something went wrong."}</p>}

      <section className="card current">
        <div><span className="muted small-text">Current plan</span><h2>{active && current ? current.name : "No active plan"}</h2></div>
        <div><span className="muted small-text">Credits left</span><h2>{active ? profile?.credits_remaining ?? 0 : 0}</h2></div>
        <div><span className="muted small-text">Expires on</span>
          <h2>{active && profile?.period_end ? new Date(profile.period_end).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—"}</h2></div>
        <div><span className="muted small-text">Daily limit</span><h2>{active ? `${profile?.daily_cap ?? 0} runs` : "—"}</h2></div>
      </section>

      <section className="plans">
        {PLANS.map((p) => (
          <form key={p.id} action="/api/pay/init" method="post" className={`plan ${p.id === "pro" ? "featured" : ""}`}>
            <input type="hidden" name="plan" value={p.id} />
            <h3>{p.name}</h3>
            <p className="price">৳{p.priceBdt.toLocaleString("en-US")}<span>/30 days</span></p>
            <ul><li>{p.credits.toLocaleString("en-US")} section optimisations</li><li>Google AIO, ChatGPT, Perplexity and voice data</li><li>History and table export</li></ul>
            <p className="muted small-text">{p.blurb}</p>
            <button type="submit" className={p.id === "pro" ? "primary" : ""} disabled={!sslConfigured()}>
              {active && current?.id === p.id ? "Renew" : `Buy ${p.name}`}
            </button>
          </form>
        ))}
      </section>
      <p className="note">Pay with bKash, Nagad, Rocket or card through SSLCommerz. A new purchase starts a new 30-day period; unused credits from a plan that is still active are carried over.</p>

      {payments && payments.length > 0 && (
        <section className="card">
          <h3>Recent payments</h3>
          <div className="rt-wrap"><table className="list">
            <thead><tr><th>Date</th><th>Plan</th><th className="num">Amount</th><th>Status</th><th>Transaction</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.tran_id}><td>{new Date(p.created_at).toLocaleDateString("en-GB")}</td><td>{planById(p.plan)?.name ?? p.plan}</td>
                <td className="num">৳{Number(p.amount).toLocaleString("en-US")}</td><td><span className={`pill ${p.status === "paid" ? "yes" : "no"}`}>{p.status}</span></td><td className="mono">{p.tran_id}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </main>
  );
}
