import { adminSupabase } from "./supabase/admin";
import { PERIOD_DAYS, planById } from "./plans";
import { validatePayment } from "./sslcommerz";

/** Validate with SSLCommerz, check it matches our pending payment, then activate the plan. Safe to call twice. */
export async function confirmPayment(valId: string, tranIdFromGateway: string): Promise<"paid" | "invalid" | "already" | "pending"> {
  const admin = adminSupabase();
  const { data: pay } = await admin.from("payments").select("*").eq("tran_id", tranIdFromGateway).single();
  if (!pay) return "invalid";
  if (pay.status === "paid") return "already";

  const v = await validatePayment(valId);
  const plan = planById(pay.plan);
  if (!plan) return "invalid";
  if (v.unreachable) return "pending"; // leave it pending so the IPN can still confirm it
  const amountOk = v.amount !== undefined && Math.abs(v.amount - Number(pay.amount)) < 0.01;
  if (!v.ok || v.tranId !== pay.tran_id || !amountOk || v.currency !== "BDT") {
    await admin.from("payments").update({ status: "failed", val_id: valId }).eq("id", pay.id).neq("status", "paid");
    return "invalid";
  }
  // Mark paid only if not paid yet, so a double callback can't grant the plan twice. A payment the browser
  // reported as failed or cancelled can still become paid when SSLCommerz validates it (e.g. a late IPN).
  const { data: updated } = await admin.from("payments")
    .update({ status: "paid", val_id: valId, paid_at: new Date().toISOString() })
    .eq("id", pay.id).neq("status", "paid").select("id");
  if (!updated?.length) return "already";
  await admin.rpc("activate_plan", { p_user: pay.user_id, p_plan: plan.id, p_credits: plan.credits, p_cap: plan.dailyCap, p_days: PERIOD_DAYS });
  return "paid";
}
