import { NextResponse } from "next/server";
import { FORMS } from "@/lib/forms";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO, PARTNER_CC, REAL_ESTATE_NOTIFY_TO } from "@/lib/email";
import { clientIpHash } from "@/lib/request";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PER_HOUR = 10;

export async function POST(req: Request) {
  let body: { type?: string; data?: Record<string, unknown>; context?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const def = body.type ? FORMS[body.type] : undefined;
  if (!def || !body.data) return NextResponse.json({ error: "Unknown form" }, { status: 400 });
  const raw = body.data;

  // Honeypot: pretend success so bots learn nothing.
  if (typeof raw.website === "string" && raw.website.trim()) return NextResponse.json({ ok: true });
  if (raw.consent !== "yes") return NextResponse.json({ error: "Please agree to the Privacy Notice to continue." }, { status: 400 });

  const clean: Record<string, string> = {};
  for (const f of def.fields) {
    const v = typeof raw[f.name] === "string" ? (raw[f.name] as string).trim().slice(0, f.type === "textarea" ? 4000 : 300) : "";
    if (f.required && !v) return NextResponse.json({ error: `Please fill in: ${f.label}` }, { status: 400 });
    if (v && f.type === "email" && !EMAIL_RE.test(v)) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    if (v && f.type === "url" && !/^https?:\/\//i.test(v)) return NextResponse.json({ error: `${f.label} must start with http:// or https://` }, { status: 400 });
    if (v && f.options && !f.options.includes(v)) return NextResponse.json({ error: `Please choose a valid option for ${f.label}` }, { status: 400 });
    if (v) clean[f.name] = v;
  }
  const eventId = typeof body.context?.event_id === "string" ? body.context.event_id : undefined;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Forms are not connected yet. Please email flameph.org@gmail.com." }, { status: 503 });

  const ipHash = await clientIpHash();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("submissions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 });

  const supabase = await createClient();
  const userId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;

  const { name, email, mobile, ...rest } = clean;
  const { error } = await admin.from("submissions").insert({
    type: def.type, name: name ?? null, email: email ?? null, mobile: mobile ?? null,
    data: { ...rest, ...(eventId ? { event_id: eventId } : {}) }, user_id: userId, ip_hash: ipHash,
  });
  if (error) return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });

  if (def.type === "event-registration" && eventId && email) {
    await admin.from("event_registrations").insert({ event_id: eventId, user_id: userId, full_name: name, email, mobile: mobile ?? null, city: clean.city ?? null });
  }

  const lines = Object.entries(clean).map(([k, v]) => `${k}: ${v}`).join("\n");
  await sendEmail({
    to: def.notificationAudience === "real-estate" ? REAL_ESTATE_NOTIFY_TO : NOTIFY_TO,
    cc: def.partnership ? [PARTNER_CC] : undefined,
    subject: `[flameph.org] ${def.title}${name ? ` — ${name}` : ""}`,
    text: `New submission: ${def.title}\n\n${lines}${eventId ? `\nevent_id: ${eventId}` : ""}\n\nManage it at /admin/submissions`,
    replyTo: email,
  });
  if (email) {
    await sendEmail({
      to: email,
      subject: "Natanggap namin ang iyong form — FLAME PH",
      text: `Hi ${name ?? ""},\n\n${def.success}\n\nForm: ${def.title}\n\nSalamat,\nFLAME PH\nflameph.org.`,
    });
  }
  return NextResponse.json({ ok: true });
}
