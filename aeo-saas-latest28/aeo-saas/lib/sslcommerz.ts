// SSLCommerz (Bangladesh: bKash, Nagad, cards). Sandbox until SSLCOMMERZ_LIVE=true.
const live = () => process.env.SSLCOMMERZ_LIVE === "true";
const host = () => (live() ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com");
export const sslConfigured = () => Boolean(process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD);

export async function initPayment(p: {
  tranId: string; amount: number; productName: string; customerName: string; customerEmail: string; baseUrl: string;
}): Promise<string> {
  const form = new URLSearchParams({
    store_id: process.env.SSLCOMMERZ_STORE_ID!,
    store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD!,
    total_amount: p.amount.toFixed(2),
    currency: "BDT",
    tran_id: p.tranId,
    success_url: `${p.baseUrl}/api/pay/return?result=success`,
    fail_url: `${p.baseUrl}/api/pay/return?result=fail`,
    cancel_url: `${p.baseUrl}/api/pay/return?result=cancel`,
    ipn_url: `${p.baseUrl}/api/pay/ipn`,
    shipping_method: "NO",
    num_of_item: "1",
    product_name: p.productName,
    product_category: "Software",
    product_profile: "non-physical-goods",
    cus_name: p.customerName,
    cus_email: p.customerEmail,
    cus_add1: "N/A",
    cus_city: "Dhaka",
    cus_postcode: "1000",
    cus_country: "Bangladesh",
    cus_phone: "01700000000",
  });
  const res = await fetch(`${host()}/gwprocess/v4/api.php`, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!json?.GatewayPageURL) throw new Error(json?.failedreason || "Payment gateway did not return a payment page.");
  return json.GatewayPageURL as string;
}

/** Ask SSLCommerz whether a payment is genuine. Never trust the browser's POST alone. */
export async function validatePayment(valId: string): Promise<{ ok: boolean; unreachable?: boolean; tranId?: string; amount?: number; currency?: string }> {
  const q = new URLSearchParams({
    val_id: valId, store_id: process.env.SSLCOMMERZ_STORE_ID!, store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD!, format: "json",
  });
  let j: any = null;
  try { j = await (await fetch(`${host()}/validator/api/validationserverAPI.php?${q}`)).json(); } catch { /* network */ }
  // unreachable = we couldn't ask; the payment stays pending and the IPN or a later callback can confirm it.
  if (!j?.status) return { ok: false, unreachable: true };
  const ok = j.status === "VALID" || j.status === "VALIDATED";
  return { ok, tranId: j.tran_id, amount: Number(j.amount), currency: j.currency };
}
