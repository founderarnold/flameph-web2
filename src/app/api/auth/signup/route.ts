import { NextResponse } from "next/server";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";

/**
 * Validates password-signup input before the browser asks Supabase Auth to
 * create the user. Phase 9 adds the server-verified anti-bot token here.
 * Account creation deliberately uses the anon browser client so this endpoint
 * can never bypass Supabase email confirmation with the service role.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please enter your name and a valid email." }, { status: 400 });
  if (password.length < 8 || password.length > 72) return NextResponse.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ error: "Please agree to the Privacy Notice first." }, { status: 400 });

  if (b.ref !== undefined && (typeof b.ref !== "string" || !/^FP-\d{1,10}$/i.test(b.ref))) {
    return NextResponse.json({ error: "That referral code is not valid." }, { status: 400 });
  }
  const limit = await checkRateLimit(req, "signup");
  if (!limit) return NextResponse.json({ error: "Sign-up is temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many sign-up attempts from this network. Please try again later." }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  }
  return NextResponse.json({ ok: true });
}
