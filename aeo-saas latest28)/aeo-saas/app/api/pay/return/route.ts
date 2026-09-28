import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/payments";
import { adminSupabase } from "@/lib/supabase/admin";

// The customer's browser comes back here (POST from SSLCommerz) after paying, failing or cancelling.
export async function POST(req: Request) {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const result = new URL(req.url).searchParams.get("result");
  const form = await req.formData();
  const tranId = String(form.get("tran_id") || "");
  const valId = String(form.get("val_id") || "");

  if (result === "success" && valId && tranId) {
    const r = await confirmPayment(valId, tranId);
    const shown = r === "invalid" ? "failed" : r === "pending" ? "pending" : "success";
    return NextResponse.redirect(`${base}/billing?payment=${shown}`, 303);
  }
  if (tranId) {
    await adminSupabase().from("payments").update({ status: result === "cancel" ? "cancelled" : "failed" }).eq("tran_id", tranId).eq("status", "pending");
  }
  return NextResponse.redirect(`${base}/billing?payment=${result === "cancel" ? "cancelled" : "failed"}`, 303);
}
