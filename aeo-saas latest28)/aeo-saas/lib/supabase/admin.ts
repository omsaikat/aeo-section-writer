import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/** Server-only client with the service role key. Never import this from client code. */
export function adminSupabase() {
  return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
