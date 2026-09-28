import Link from "next/link";
import { authEnabled } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";

export default async function Nav() {
  let email: string | null = null;
  let credits: number | null = null;
  if (authEnabled()) {
    const { supabase, user } = await currentUser();
    if (user) {
      email = user.email ?? "Account";
      const { data } = await supabase.from("profiles").select("credits_remaining, period_end").eq("id", user.id).single();
      // An ended period counts as 0 even before the next run resets it in the database.
      credits = data ? (new Date(data.period_end) > new Date() ? data.credits_remaining : 0) : null;
    }
  }
  return (
    <nav className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brandline"><span className="logo">A</span>AEO Section Writer</Link>
        <div className="navlinks">
          {authEnabled() && !email && <><Link href="/#pricing">Pricing</Link><Link href="/login" className="navbtn">Sign in</Link></>}
          {(email || !authEnabled()) && <Link href="/optimize">Optimise</Link>}
          {email && <Link href="/history">History</Link>}
          {email && <Link href="/billing">{credits !== null ? `${credits} credits` : "Billing"}</Link>}
          {email && <form action="/auth/signout" method="post"><button className="linkbtn" type="submit" title={email}>Sign out</button></form>}
        </div>
      </div>
    </nav>
  );
}
