import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { ORG } from "@/lib/site";
import { OPPORTUNITY_KINDS, type Opportunity, dateLabel, matches, notExpired } from "@/lib/growth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Weekly "Ngayong linggo" email (and push) for members who said yes to updates. Runs from Vercel Cron (vercel.json),
 * which sends `Authorization: Bearer $CRON_SECRET`. Each member gets their own inquiries, views and matched picks.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekAgoDay = weekAgo.toISOString().slice(0, 10);
  const [{ data: profiles }, { data: bizs }, { data: opps }, { data: deals }, { data: events }, { data: inquiries }, { data: stats }] = await Promise.all([
    admin.from("profiles").select("id, full_name, province, business_stage").eq("consent_marketing", true).eq("status", "active"),
    admin.from("businesses").select("id, owner_id, sector, province"),
    admin.from("opportunities").select("*").eq("published", true),
    admin.from("deals").select("id, title, deadline").eq("published", true).eq("status", "open"),
    admin.from("events").select("title, starts_at, city").eq("published", true).eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
    admin.from("business_inquiries").select("owner_id").gte("created_at", weekAgo.toISOString()),
    admin.from("business_stats").select("business_id, views").gte("day", weekAgoDay),
  ]);

  // Emails live in auth.users; read them page by page.
  const emails = new Map<string, string>();
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    (data?.users ?? []).forEach((u) => u.email && u.email_confirmed_at && emails.set(u.id, u.email));
    if (!data || data.users.length < 1000) break;
  }

  const bizBy = new Map((bizs ?? []).map((b) => [b.owner_id, b]));
  const inqBy = new Map<string, number>();
  (inquiries ?? []).forEach((q) => inqBy.set(q.owner_id, (inqBy.get(q.owner_id) ?? 0) + 1));
  const viewsBy = new Map<string, number>();
  (stats ?? []).forEach((s) => viewsBy.set(s.business_id, (viewsBy.get(s.business_id) ?? 0) + s.views));
  const openOpps = ((opps ?? []) as Opportunity[]).filter((o) => notExpired(o.deadline));

  let sent = 0, skipped = 0;
  for (const p of profiles ?? []) {
    const email = emails.get(p.id);
    if (!email) { skipped++; continue; }
    const biz = bizBy.get(p.id);
    const mine = openOpps.filter((o) => matches(o, { province: biz?.province ?? p.province, sector: biz?.sector, stage: p.business_stage })).slice(0, 3);
    const newInq = inqBy.get(p.id) ?? 0;
    const views = biz ? viewsBy.get(biz.id) ?? 0 : 0;
    if (!mine.length && !newInq && !(deals ?? []).length && !(events ?? []).length) { skipped++; continue; }

    const lines = [
      `Kumusta${p.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}! Here's your FLAME PH week.`,
      "",
      ...(biz ? [`Your listing: ${views} view${views === 1 ? "" : "s"} and ${newInq} new inquir${newInq === 1 ? "y" : "ies"} this week.`, newInq ? `Reply here: ${ORG.url}/account/inquiries` : `Make it stronger: ${ORG.url}/account/business`, ""] : [`List your business free: ${ORG.url}/account/business`, ""]),
      ...(mine.length ? ["Opportunities for you:", ...mine.map((o) => `- ${o.title} (${OPPORTUNITY_KINDS[o.kind] ?? "Opportunity"}${o.deadline ? `, apply by ${dateLabel(o.deadline)}` : ""})`), `  ${ORG.url}/opportunities?mine=1`, ""] : []),
      ...((deals ?? []).length ? ["Buy together this week:", ...(deals ?? []).slice(0, 2).map((d) => `- ${d.title}${d.deadline ? ` (join by ${dateLabel(d.deadline)})` : ""}`), `  ${ORG.url}/deals`, ""] : []),
      ...((events ?? []).length ? ["Coming up:", ...(events ?? []).map((e) => `- ${e.title}, ${new Date(e.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}${e.city ? `, ${e.city}` : ""}`), ""] : []),
      `Your growth path: ${ORG.url}/account/growth`,
      "",
      `You get this because you said yes to FLAME PH updates. To stop, untick it in your profile: ${ORG.url}/account/profile`,
    ];
    const ok = await sendEmail({ to: email, subject: newInq ? `${newInq} new inquir${newInq === 1 ? "y" : "ies"} + your FLAME PH week` : "Your FLAME PH week: opportunities and events", text: lines.join("\n") });
    if (ok) sent++; else skipped++;
    if (mine.length || newInq) {
      await sendPush(p.id, { title: "Your FLAME PH week", body: newInq ? `${newInq} new inquiries and ${mine.length} opportunities for you` : `${mine.length} new opportunities for you`, url: newInq ? "/account/inquiries" : "/opportunities?mine=1" });
    }
  }
  return NextResponse.json({ ok: true, sent, skipped });
}
