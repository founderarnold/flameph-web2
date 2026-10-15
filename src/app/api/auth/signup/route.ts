import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Join with email + password, signed in straight away (no confirmation email to wait for).
 * The email is not proven yet, so the account is marked `email_unverified` until the member signs in once with an
 * email code; until then other FLAME PH sites don't trust it (see /sso/authorize).
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please enter your name and a valid email." }, { status: 400 });
  if (password.length < 8 || password.length > 72) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ error: "Please agree to the Privacy Notice first." }, { status: 400 });

  const ref = typeof b.ref === "string" && /^FP-\d{1,10}$/i.test(b.ref) ? b.ref.toUpperCase() : undefined;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Sign-up is not available right now. Please try again soon." }, { status: 503 });
  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: name, consent_privacy: true, consent_marketing: b.marketing === true, ...(ref ? { ref } : {}) },
    app_metadata: { email_unverified: true },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) return NextResponse.json({ error: "May account na ang email na ito. Log in instead.", exists: true }, { status: 409 });
    return NextResponse.json({ error: "Hindi ma-create ang account. Please try again." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
