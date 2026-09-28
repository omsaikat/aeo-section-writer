import { redirect } from "next/navigation";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";
import Tool from "./Tool";

export const dynamic = "force-dynamic";

export default async function OptimizePage() {
  if (!authEnabled()) return <Tool initialCredits={null} />;
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login?next=/optimize");
  const { data } = await supabase.from("profiles").select("credits_remaining, period_end").eq("id", user.id).single();
  const credits = data ? (new Date(data.period_end) > new Date() ? data.credits_remaining : 0) : 0;
  return <Tool initialCredits={credits} />;
}
