import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { planById } from "@/lib/plans";
import { adminSupabase } from "@/lib/supabase/admin";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import { initPayment, sslConfigured } from "@/lib/sslcommerz";

export async function POST(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!authEnabled() || !sslConfigured()) return NextResponse.redirect(`${base}/billing?error=not_configured`, 303);
  const { user } = await currentUser();
  if (!user) return NextResponse.redirect(`${base}/login?next=/billing`, 303);

  const form = await req.formData();
  const plan = planById(String(form.get("plan") || ""));
  if (!plan) return NextResponse.redirect(`${base}/billing`, 303);

  const tranId = `AEO-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const admin = adminSupabase();
  const { error } = await admin.from("payments").insert({ user_id: user.id, tran_id: tranId, plan: plan.id, amount: plan.priceBdt, currency: "BDT" });
  if (error) return NextResponse.redirect(`${base}/billing?error=db`, 303);

  try {
    const url = await initPayment({
      tranId, amount: plan.priceBdt, productName: `AEO Section Writer ${plan.name} (30 days)`,
      customerName: user.user_metadata?.full_name || user.email || "Customer", customerEmail: user.email || "", baseUrl: base,
    });
    return NextResponse.redirect(url, 303);
  } catch {
    await admin.from("payments").update({ status: "failed" }).eq("tran_id", tranId);
    return NextResponse.redirect(`${base}/billing?error=gateway`, 303);
  }
}
