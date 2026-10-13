"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

export function AuthForm({ mode, next = "/account", haveCode = false }: { mode: "join" | "login"; next?: string; haveCode?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [step, setStep] = useState<"start" | "code">(haveCode ? "code" : "start");
  // True when they arrived with a code already in hand, so we still need their email.
  const [askEmail, setAskEmail] = useState(haveCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!supabase) return <p className="rounded-lg bg-warn-soft p-4 text-warn">Sign-up opens once the database is connected. Please check back soon.</p>;

  const callback = (extra = "") => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${extra}`;
  const needConsent = mode === "join" && !consent;

  async function google() {
    if (needConsent) return setError("Please agree to the Privacy Notice first.");
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(mode === "join" ? `&consent=1&mkt=${marketing ? 1 : 0}` : "") } });
    if (error) { setError(error.message); setBusy(false); }
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (needConsent) return setError("Please agree to the Privacy Notice first.");
    setBusy(true); setError("");
    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callback(),
        shouldCreateUser: mode === "join",
        data: mode === "join" ? { full_name: name, consent_privacy: true, consent_marketing: marketing } : undefined,
      },
    });
    setBusy(false);
    if (error) setError(mode === "login" && /signups? not allowed|not found/i.test(error.message) ? "No account with that email yet. Join free instead." : error.message);
    else { setAskEmail(false); setStep("code"); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase!.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError("Mali o expired ang code. Try again or request a new one.");
    // Signing in for another FLAME PH site: a full page load lets /sso send them back there.
    if (next.startsWith("/sso/")) return window.location.assign(next);
    router.replace(next);
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-4">
        {askEmail ? (
          <div><label htmlFor="em2" className="label">Your email</label><input id="em2" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></div>
        ) : (
          <p role="status" className="rounded-lg bg-ok-soft p-3 text-ok">We sent an email to <b>{email}</b>. Type the 6-digit code from it here. Check your Spam or Promotions folder if you don&apos;t see it.</p>
        )}
        <div>
          <label htmlFor="otp" className="label">Code from your email</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" required value={code} onChange={(e) => setCode(e.target.value)} className="input text-center text-2xl tracking-[0.4em]" />
        </div>
        {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Checking…" : "Continue"}</button>
        <button type="button" className="btn btn-ghost w-full" onClick={() => { setAskEmail(false); setStep("start"); }}>{askEmail ? "Email me a new code" : "Use a different email"}</button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {mode === "join" && (
        <div className="space-y-3 rounded-xl bg-bg-soft p-4">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" required />
            <span>I agree to the <Link className="underline" href="/legal/privacy">Privacy Notice</Link>, <Link className="underline" href="/legal/terms">Terms of Use</Link> and <Link className="underline" href="/membership/terms">Membership Terms</Link>, and allow FLAME PH to process my data under the Data Privacy Act of 2012. <span className="text-flame-strong">*</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>Send me the MSME Bulletin and event updates (optional).</span>
          </label>
        </div>
      )}
      {/* Shown only once Google sign-in is switched on in Supabase (set NEXT_PUBLIC_GOOGLE_AUTH=1 in Vercel). */}
      {GOOGLE_ON && (
        <>
          <button type="button" onClick={google} disabled={busy} className="btn btn-outline w-full">
            <svg aria-hidden width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />o kaya sa email<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      <form onSubmit={sendCode} className="space-y-4">
        {mode === "join" && (
          <div><label htmlFor="nm" className="label">Full name</label><input id="nm" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
        )}
        <div><label htmlFor="em" className="label">Email</label><input id="em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></div>
        {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
        <button className="btn btn-flame w-full" disabled={busy}>{busy ? "Sending…" : mode === "join" ? "Email me a sign-up code" : "Email me a login code"}</button>
      </form>
      <button type="button" className="text-sm font-semibold text-mph underline" onClick={() => { setError(""); setAskEmail(true); setStep("code"); }}>I already have a code from my email</button>
      <p className="text-sm text-muted">No password needed. We email you a fresh one-time code every time you log in, so there&apos;s no password to forget or reset.</p>
    </div>
  );
}
