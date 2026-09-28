import { confirmPayment } from "@/lib/payments";

// Server-to-server notification from SSLCommerz. Arrives even if the customer closes the browser.
export async function POST(req: Request) {
  const form = await req.formData();
  const valId = String(form.get("val_id") || "");
  const tranId = String(form.get("tran_id") || "");
  const status = String(form.get("status") || "");
  if (valId && tranId && (status === "VALID" || status === "VALIDATED")) await confirmPayment(valId, tranId);
  return new Response("OK");
}
