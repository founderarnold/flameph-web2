"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createEmailLinkClient } from "@/lib/supabase/browser";
import { Turnstile } from "@/components/Turnstile";

/** "1" turns a button on. Tolerates stray whitespace or a byte-order mark in the Vercel value. */
const flag = (v: string | undefined) => (v ?? "").replace(/^﻿/, "").trim() === "1";
const GOOGLE_ON = flag(process.env.NEXT_PUBLIC_GOOGLE_AUTH);
const FACEBOOK_ON = flag(process.env.NEXT_PUBLIC_FACEBOOK_AUTH);

type Method = "password" | "code";
type Props = { mode: "join" | "login"; next?: string; haveCode?: boolean; initialEmail?: string; referral?: string };

/**
 * Join / log in. Default is email + password (no waiting for emails). The email-code option covers members
 * without a password and "forgot password". Codes are typed into one box that submits itself.
 */
export function AuthForm({ mode, next = "/account", haveCode = false, initialEmail = "", referral }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [method, setMethod] = useState<Method>(haveCode ? "code" : "password");
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [codeSent, setCodeSent] = useState(haveCode);
  const [resetting, setResetting] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [topError, setTopError] = useState(""); // for the Google / Facebook buttons, shown next to the agree box
  const [turnstileToken, setTurnstileToken] = useState("");
  const [authBotReset, setAuthBotReset] = useState(0);
  // "?fb=1" shows the Facebook button before it is switched on for everyone (for the app's own test sign-in).
  const [fbPreview, setFbPreview] = useState(false);
  useEffect(() => { setFbPreview(new URLSearchParams(window.location.search).get("fb") === "1"); }, []);
  const facebookOn = FACEBOOK_ON || fbPreview;

  // Remember the email between visits so returning members only type their password or code.
  useEffect(() => { if (!initialEmail) try { setEmail(localStorage.getItem("fl-email") || ""); } catch {} }, [initialEmail]);
  const remember = () => { try { localStorage.setItem("fl-email", email.trim()); } catch {} };

  if (!supabase) return <p className="rounded-lg bg-warn-soft p-4 text-warn">Sign-up opens once the database is connected. Please check back soon.</p>;

  const needConsent = mode === "join" && !consent;
  const callback = (extra = "") => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${extra}`;

  function finish(to = next) {
    remember();
    // Signing in for another FLAME PH site: a full page load lets /sso send them back there.
    if (to.startsWith("/sso/")) return window.location.assign(to);
    router.replace(to);
    router.refresh();
  }

  async function oauth(provider: "google" | "facebook") {
    if (needConsent) return setTopError("Tick the box above first, then tap the button again.");
    setBusy(true); setTopError("");
    const { error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback(mode === "join" ? `&consent=1&mkt=${marketing ? 1 : 0}${referral ? `&ref=${encodeURIComponent(referral)}` : ""}` : ""),
        ...(provider === "facebook" ? { scopes: "email" } : {}),
      },
    });
    if (error) { setTopError(`${provider === "google" ? "Google" : "Facebook"} sign-in isn't available right now. Use your email instead.`); setBusy(false); }
  }
  const google = () => oauth("google");

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    if (needConsent) return setError("Please agree to the Privacy Notice first.");
    if (!turnstileToken) return setError("Please complete the security check.");
    setBusy(true); setError("");
    if (mode === "join") {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password, consent, marketing, ref: referral }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setBusy(false); return setError(j.error || "May problema. Please try again."); }
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
        options: {
          captchaToken: turnstileToken,
          emailRedirectTo: callback(),
          data: {
            full_name: name.trim(),
            consent_privacy: true,
            consent_marketing: marketing,
            email_verification_required: true,
            ...(referral ? { ref: referral } : {}),
          },
        },
      });
      setTurnstileToken(""); setAuthBotReset((n) => n + 1);
      if (error) { setBusy(false); return setError(/already registered|already exists/i.test(error.message) ? "May account na ang email na ito. Log in instead, or use \"Email me a link\"." : "Hindi ma-create ang account. Please try again."); }
      if (data.user && data.user.identities?.length === 0) { setBusy(false); return setError("May account na ang email na ito. Log in instead, or use \"Email me a link\"."); }
      if (data.session) await supabase!.auth.signOut();
      remember();
      setBusy(false); setCodeSent(true); setCode(""); setMethod("code");
      return;
    }
    const { error } = await supabase!.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: turnstileToken },
    });
    setTurnstileToken(""); setAuthBotReset((n) => n + 1);
    setBusy(false);
    if (error) {
      return setError("Mali ang email o password. No password yet? Tap \"Email me a link\".");
    }
    finish();
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (needConsent) return setError("Please agree to the Privacy Notice first.");
    if (!email.trim()) return setError("Type your email first.");
    if (!turnstileToken) return setError("Please complete the security check.");
    setBusy(true); setError("");
    const target = resetting ? "/account/password" : next;
    const { error } = await (createEmailLinkClient() ?? supabase!).auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/link?next=${encodeURIComponent(target)}`,
        shouldCreateUser: mode === "join",
        captchaToken: turnstileToken,
        data: mode === "join" ? { full_name: name, consent_privacy: true, consent_marketing: marketing, ...(referral ? { ref: referral } : {}) } : undefined,
      },
    });
    setTurnstileToken(""); setAuthBotReset((n) => n + 1);
    setBusy(false);
    if (error) return setError(/signups? not allowed|not found/i.test(error.message) ? "No account with that email yet. Join free instead." : /rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another code." : "Hindi ma-send ang code. Please try again.");
    remember();
    setCodeSent(true); setCode("");
  }

  async function verify(token: string) {
    if (busy || !email.trim()) return;
    setBusy(true); setError("");
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token, type: "email" });
    setBusy(false);
    if (error) { setCode(""); return setError("Mali o expired ang code. Check the newest email, or tap \"Send a new link\"."); }
    finish(resetting ? "/account/password" : next);
  }

  const tabs = (
    <div role="tablist" aria-label="How to sign in" className="grid grid-cols-2 rounded-xl bg-bg-soft p-1 text-sm font-semibold">
      {(["password", "code"] as const).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={method === m} onClick={() => { setMethod(m); setError(""); setResetting(false); }}
          className={`min-h-11 rounded-lg ${method === m ? "bg-bg text-primary shadow-sm" : "text-muted"}`}>
          {m === "password" ? "Password" : "Email me a link"}
        </button>
      ))}
    </div>
  );

  const consentBox = mode === "join" && (
        <div className="space-y-3 rounded-xl bg-bg-soft p-4">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (e.target.checked) setTopError(""); }} className="mt-1 h-6 w-6 shrink-0" required />
            <span>I agree to the <Link className="underline" href="/legal/privacy">Privacy Notice</Link>, <Link className="underline" href="/legal/terms">Terms of Use</Link> and <Link className="underline" href="/membership/terms">Membership Terms</Link>, and allow FLAME PH to process my data under the Data Privacy Act of 2012. <span className="text-flame-strong">*</span></span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>Send me the MSME Bulletin and event updates (optional).</span>
          </label>
        </div>
      );

  const emailField = (
    <div><label htmlFor="em" className="label">Email</label><input id="em" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" /></div>
  );

  return (
    <div className="space-y-5">
      {/* Joining: the agree box comes first, above the Google and Facebook buttons, so it is never below the screen. */}
      {consentBox}
      {topError && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{topError}</p>}
      {(GOOGLE_ON || facebookOn) && (
        <>
          {facebookOn && (
            <button type="button" onClick={() => oauth("facebook")} disabled={busy} className="btn w-full bg-[#1877F2] text-white hover:bg-[#166fe5]">
              <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.5h-2.8V24C19.62 23.1 24 18.1 24 12.07" /></svg>
              Continue with Facebook
            </button>
          )}
          {GOOGLE_ON && (
          <button type="button" onClick={google} disabled={busy} className="btn btn-outline w-full">
            <svg aria-hidden width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          )}
          <div className="flex items-center gap-3 text-sm text-muted"><span className="h-px flex-1 bg-line" />o kaya<span className="h-px flex-1 bg-line" /></div>
        </>
      )}
      {tabs}

      {method === "password" ? (
        <form onSubmit={withPassword} className="space-y-4">
          {mode === "join" && (
            <div><label htmlFor="nm" className="label">Full name</label><input id="nm" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
          )}
          {emailField}
          <div>
            <label htmlFor="pw" className="label">{mode === "join" ? "Create a password" : "Password"}</label>
            <div className="flex gap-2">
              <input id="pw" type={show ? "text" : "password"} required minLength={mode === "join" ? 8 : 1} autoComplete={mode === "join" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
              <button type="button" className="btn btn-ghost shrink-0" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
            </div>
            {mode === "join" && <p className="mt-1 text-sm text-muted">At least 8 characters.</p>}
          </div>
          <Turnstile action="auth" onToken={setTurnstileToken} resetKey={authBotReset} />
          {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <button className="btn btn-flame w-full text-lg" disabled={busy || !turnstileToken}>{busy ? "Please wait…" : mode === "join" ? "Join free" : "Log in"}</button>
          {mode === "login" && (
            <button type="button" className="w-full text-center text-sm font-semibold text-mph underline" onClick={() => { setMethod("code"); setResetting(true); setError(""); }}>
              Forgot your password?
            </button>
          )}
        </form>
      ) : !codeSent ? (
        <form onSubmit={sendCode} className="space-y-4">
          {mode === "join" && (
            <div><label htmlFor="nm2" className="label">Full name</label><input id="nm2" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
          )}
          {emailField}
          {resetting && <p className="text-sm text-muted">We&apos;ll email you a sign-in link. After you tap it, you can set a new password.</p>}
          <Turnstile action="auth" onToken={setTurnstileToken} resetKey={authBotReset} />
          {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <button className="btn btn-flame w-full text-lg" disabled={busy || !turnstileToken}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          <button type="button" className="w-full text-center text-sm font-semibold text-mph underline" onClick={() => { setCodeSent(true); setError(""); }}>I already have a code</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(code.trim()); }} className="space-y-4">
          {emailField}
          <div>
            <p role="status" className="mb-3 rounded-lg bg-ok-soft p-3 text-ok">Check your email and <b>tap the sign-in link</b>. It works on any phone or app. If your email shows a 6-digit code instead, type it here.</p>
            <label htmlFor="otp" className="label">6-digit code (if your email has one)</label>
            <input id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={10} required value={code}
              onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setCode(v); if (v.length === 6) verify(v); }}
              className="input text-center text-3xl tracking-[0.5em]" placeholder="••••••" />
            <p className="mt-1 text-sm text-muted">Not in your inbox? Check Spam or Promotions.</p>
          </div>
          {error && <p role="alert" className="font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || code.length < 6}>{busy ? "Checking…" : "Continue"}</button>
          <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => sendCode()}>Send a new link</button>
        </form>
      )}
    </div>
  );
}
