// Plans and prices. Amounts are in BDT for SSLCommerz. Change them here only.
export type PlanId = "starter" | "pro" | "agency";
export type Plan = { id: PlanId; name: string; priceBdt: number; credits: number; dailyCap: number; blurb: string };

export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", priceBdt: 1499, credits: 70, dailyCap: 30, blurb: "For a single website." },
  { id: "pro", name: "Pro", priceBdt: 3999, credits: 210, dailyCap: 80, blurb: "For busy content teams." },
  { id: "agency", name: "Agency", priceBdt: 9999, credits: 700, dailyCap: 200, blurb: "For SEO agencies with many clients." },
];

/** Paid plans only. There is no free plan: new accounts start with no credits. */
export const planById = (id: string | null | undefined): Plan | null => PLANS.find((p) => p.id === id) ?? null;
export const PERIOD_DAYS = 30;
