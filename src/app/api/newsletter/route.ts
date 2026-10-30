import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { ORG } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.website) return NextResponse.json({ ok: true, message: "Check your email to confirm." });
  const botCheck = await verifyTurnstile(req, body.turnstileToken, "newsletter");
  if (!botCheck.ok) return NextResponse.json({ error: botCheck.error }, { status: botCheck.status });
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  if (body.consent !== "yes") return NextResponse.json({ error: "Please agree to the Privacy Notice." }, { status: 400 });
  const limit = await checkRateLimit(req, "newsletter", { identifier: email });
  if (!limit) return NextResponse.json({ error: "Newsletter sign-up is temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests for this email. Please try again later." }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Newsletter sign-up isn't connected yet. Please try again soon." }, { status: 503 });

  const { data, error } = await admin.from("newsletter_subscribers")
    .upsert({ email, consent: true, unsubscribed_at: null }, { onConflict: "email" })
    .select("confirm_token, confirmed_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not subscribe. Please try again." }, { status: 500 });

  if (!data.confirmed_at) {
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const link = `${base}/api/newsletter/confirm?token=${data.confirm_token}`;
    await sendEmail({ to: email, subject: "Please confirm: MSME Bulletin Newsletter", text: `Salamat sa pag-subscribe!\n\nConfirm your subscription by opening this link:\n${link}\n\nIf you didn't ask for this, ignore this email.\n\nFLAME PH · ${ORG.emailPrimary}` });
  }
  return NextResponse.json({ ok: true, message: data.confirmed_at ? "You're already subscribed. Salamat!" : "Halos tapos na! Check your email and click the link to confirm." });
}
