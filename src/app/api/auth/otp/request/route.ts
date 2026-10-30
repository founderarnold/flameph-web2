import { NextResponse } from "next/server";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  if (body.createUser === true) {
    const signupLimit = await checkRateLimit(req, "signup");
    if (!signupLimit) return NextResponse.json({ error: "Sign-up is temporarily unavailable." }, { status: 503 });
    if (!signupLimit.allowed) {
      return NextResponse.json({ error: "Too many sign-up attempts from this network. Please try again later." }, { status: 429, headers: retryAfterHeaders(signupLimit.retryAfter) });
    }
  }
  const limit = await checkRateLimit(req, "otp_request", { identifier: email });
  if (!limit) return NextResponse.json({ error: "Verification requests are temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many verification emails. Please wait and try again." }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });
  }
  return NextResponse.json({ ok: true });
}
