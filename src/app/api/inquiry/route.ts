import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A buyer sends an inquiry from a public listing. Saved to the owner's inbox; emailed to them when email is set up. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (str(b.website, 100)) return NextResponse.json({ ok: true }); // honeypot
  const bizId = str(b.bizId, 40);
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const mobile = str(b.mobile, 20);
  const message = str(b.message, 1500);
  const product = str(b.product, 120);
  if (!/^[0-9a-f-]{36}$/i.test(bizId) || !name || message.length < 5) return NextResponse.json({ error: "Please add your name and a message." }, { status: 400 });
  if (!email && !mobile) return NextResponse.json({ error: "Add an email or mobile number so they can reply." }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Please check your email address." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Inquiries are not available right now. Please use the contact buttons." }, { status: 503 });
  const { data: biz } = await admin.from("businesses").select("id, name, slug, owner_id, contact_email").eq("id", bizId).eq("published", true).maybeSingle();
  if (!biz) return NextResponse.json({ error: "This business is no longer listed." }, { status: 404 });
  const { data: ownerProfile } = await admin.from("profiles").select("status").eq("id", biz.owner_id).maybeSingle();
  if (ownerProfile?.status !== "active") return NextResponse.json({ error: "This business is no longer listed." }, { status: 404 });

  // Simple flood guard: at most 5 inquiries per sender per business per day.
  const since = new Date(Date.now() - 86400000).toISOString();
  const who = email || mobile;
  const { count } = await admin.from("business_inquiries").select("id", { count: "exact", head: true })
    .eq("business_id", biz.id).gte("created_at", since).eq(email ? "email" : "mobile", who);
  if ((count ?? 0) >= 5) return NextResponse.json({ error: `You've already sent several messages to ${biz.name} today. Please wait for their reply.` }, { status: 429 });

  const { user } = await getSession();
  const { error } = await admin.from("business_inquiries").insert({
    business_id: biz.id, owner_id: biz.owner_id, from_user_id: user?.id ?? null,
    name, email: email || null, mobile: mobile || null, message, product_name: product || null,
  });
  if (error) return NextResponse.json({ error: "Hindi na-send. Please try again." }, { status: 500 });

  const { data: owner } = await admin.auth.admin.getUserById(biz.owner_id);
  const to = [...new Set([owner.user?.email, biz.contact_email].filter(Boolean) as string[])];
  if (to.length) {
    await sendEmail({
      to, replyTo: email || undefined,
      subject: `New inquiry for ${biz.name}${product ? `: ${product}` : ""}`,
      text: `${name} sent an inquiry through your FLAME PH listing.\n\n${product ? `Interested in: ${product}\n` : ""}Message:\n${message}\n\nReply to: ${[email, mobile].filter(Boolean).join(" / ")}\n\nSee all inquiries: https://flameph.org/account/inquiries`,
    });
  }
  await sendPush(biz.owner_id, { title: `New inquiry for ${biz.name}`, body: `${name}: ${message.slice(0, 120)}`, url: "/account/inquiries" });
  return NextResponse.json({ ok: true });
}
