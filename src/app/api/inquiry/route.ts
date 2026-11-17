import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkRateLimit, retryAfterHeaders } from "@/lib/rate-limit";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * A buyer sends an inquiry (or a quote request) from a public listing. Saved to the owner's inbox, then the owner is told
 * in the app, by push and by email, as they chose in Settings (every email has a working unsubscribe).
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (str(b.website, 100)) return NextResponse.json({ ok: true }); // honeypot
  const botCheck = await verifyTurnstile(req, b.turnstileToken, "inquiry");
  if (!botCheck.ok) return NextResponse.json({ error: botCheck.error }, { status: botCheck.status });
  const bizId = str(b.bizId, 40);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const mobile = str(b.mobile, 20);
  const message = str(b.message, 1500);
  const product = str(b.product, 120);
  const quote = b.kind === "quote";
  if (!/^[0-9a-f-]{36}$/i.test(bizId) || !name || message.length < 5) return NextResponse.json({ error: "Please add your name and a message." }, { status: 400 });
  if (!email && !mobile) return NextResponse.json({ error: "Add an email or mobile number so they can reply." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please check your email address." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Inquiries are not available right now. Please use the contact buttons." }, { status: 503 });
  const { data: biz } = await admin.from("businesses").select("id, name, slug, owner_id, contact_email")
    .eq("id", bizId).eq("published", true).eq("publication_status", "published").eq("lifecycle_status", "approved").eq("risk_level", "low").maybeSingle();
  if (!biz) return NextResponse.json({ error: "This business is no longer listed." }, { status: 404 });
  const { data: ownerProfile } = await admin.from("profiles").select("status").eq("id", biz.owner_id).maybeSingle();
  if (ownerProfile?.status !== "active") return NextResponse.json({ error: "This business is no longer listed." }, { status: 404 });

  const who = email || mobile;
  const limit = await checkRateLimit(req, "inquiry", { identifier: `${biz.id}:${who}` });
  if (!limit) return NextResponse.json({ error: "Inquiries are temporarily unavailable." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: `You've already sent several messages to ${biz.name} today. Please wait for their reply.` }, { status: 429, headers: retryAfterHeaders(limit.retryAfter) });

  const { user } = await getSession();
  const row: Record<string, unknown> = {
    business_id: biz.id, owner_id: biz.owner_id, from_user_id: user?.id ?? null,
    name, email: email || null, mobile: mobile || null, message, product_name: product || null,
  };
  let { error } = await admin.from("business_inquiries").insert(quote ? { ...row, kind: "quote" } : row);
  // Before the 0021 database update there is no "kind" column: save the quote request as an inquiry, marked in the text.
  if (error && quote && /kind/.test(error.message)) ({ error } = await admin.from("business_inquiries").insert({ ...row, message: `[Quote request] ${message}` }));
  if (error) return NextResponse.json({ error: "Hindi na-send. Please try again." }, { status: 500 });

  const what = quote ? "quote request" : "inquiry";
  await notify(biz.owner_id, quote ? "quotes" : "leads", {
    title: `New ${what} for ${biz.name}`, body: `${name}: ${message.slice(0, 120)}`, url: `/account/inquiries${quote ? "?kind=quote" : ""}`,
    email: {
      to: biz.contact_email ? [biz.contact_email] : [], replyTo: email || undefined,
      subject: `New ${what} for ${biz.name}${product ? `: ${product}` : ""}`,
      text: `${name} sent a ${what} through your FLAME PH listing.\n\n${product ? `Interested in: ${product}\n` : ""}Message:\n${message}\n\nReply to: ${[email, mobile].filter(Boolean).join(" / ")}`,
    },
  });
  return NextResponse.json({ ok: true });
}
