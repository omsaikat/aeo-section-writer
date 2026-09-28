"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") setError("That sign-in link has expired or was already used. Send a new one.");
  }, []);
  const [busy, setBusy] = useState(false);
  const redirectTo = () => {
    const next = new URLSearchParams(window.location.search).get("next") || "/billing";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  };

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await createBrowserSupabase().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }
  async function google() {
    setError("");
    const { error } = await createBrowserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    if (error) setError(error.message);
  }

  return (
    <main className="wrap narrow">
      <section className="card auth">
        <h1>Sign in</h1>
        <p className="sub">New here? Signing in creates your account. Then choose a plan to start optimising.</p>
        <button type="button" className="google" onClick={google}>Continue with Google</button>
        <div className="or"><span>or</span></div>
        {sent ? (
          <p className="okmsg">Check <b>{email}</b> for a sign-in link. You can close this tab.</p>
        ) : (
          <form onSubmit={magicLink} className="stack">
            <div><label htmlFor="email">Work email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></div>
            <button type="submit" className="primary" disabled={busy || !email}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          </form>
        )}
        {error && <p className="status err">{error}</p>}
      </section>
    </main>
  );
}
