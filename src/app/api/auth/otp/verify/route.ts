import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, clearRateLimit, retryAfterHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.replace(/\D/g, "").slice(0, 10) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || token.length < 6) {
    return NextResponse.json({ error: "Enter the email and newest verification code." }, { status: 400 });
  }

  const limit = await checkRateLimit(req, "otp_verify_failure", { identifier: email, increment: false });
  if (!limit) return NextResponse.json({ error: "Verification is temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many incorrect codes. Please wait before trying again." }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Verification is temporarily unavailable." }, { status: 503 });
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    await checkRateLimit(req, "otp_verify_failure", { identifier: email, increment: true });
    return NextResponse.json({ error: "Incorrect or expired code. Use the newest email." }, { status: 400 });
  }
  await clearRateLimit("otp_verify_failure", limit.keyHash);
  return NextResponse.json({ ok: true });
}
