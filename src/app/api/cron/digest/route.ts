import { NextResponse } from "next/server";
import { withWarning } from "@/lib/investor";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { unsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";
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
  const [{ data: profiles }, { data: bizs }, { data: opps }, { data: deals }, { data: events }, { data: inquiries }, { data: stats }, extra] = await Promise.all([
    admin.from("profiles").select("*").eq("consent_marketing", true).eq("status", "active"),
    admin.from("businesses").select("id, owner_id, sector, province"),
    admin.from("opportunities").select("*").eq("published", true),
    admin.from("deals").select("id, title, deadline").eq("published", true).eq("status", "open"),
    admin.from("events").select("title, starts_at, city, chapter_id").eq("published", true).eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(30),
    admin.from("business_inquiries").select("owner_id").gte("created_at", weekAgo.toISOString()),
    admin.from("business_stats").select("business_id, views").gte("day", weekAgoDay),
    weekExtras(admin, weekAgo),
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
    const chapterId = (p as { chapter_id?: string | null }).chapter_id ?? null;
    const coming = [...(events ?? [])].sort((a, b) => Number(Boolean(chapterId) && b.chapter_id === chapterId) - Number(Boolean(chapterId) && a.chapter_id === chapterId)).slice(0, 3);
    const myGroups = extra.groupsOf.get(p.id) ?? new Set<string>();
    const groupPosts = extra.groupPosts.filter((g) => myGroups.has(g.group_id) && g.author_id !== p.id).slice(0, 3);
    if (!mine.length && !newInq && !(deals ?? []).length && !coming.length && !extra.headlines.length && !extra.blog.length && !groupPosts.length) { skipped++; continue; }

    const lines = [
      `Kumusta${p.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}! Here's your FLAME PH week.`,
      "",
      ...(biz ? [`Your listing: ${views} view${views === 1 ? "" : "s"} and ${newInq} new inquir${newInq === 1 ? "y" : "ies"} this week.`, newInq ? `Reply here: ${ORG.url}/account/inquiries` : `Make it stronger: ${ORG.url}/account/business`, ""] : [`List your business free: ${ORG.url}/account/business`, ""]),
      ...(mine.length ? ["Opportunities for you:", ...mine.map((o) => `- ${o.title} (${OPPORTUNITY_KINDS[o.kind] ?? "Opportunity"}${o.deadline ? `, apply by ${dateLabel(o.deadline)}` : ""})`), `  ${ORG.url}/opportunities?mine=1`, ""] : []),
      ...((deals ?? []).length ? ["Buy together this week:", ...(deals ?? []).slice(0, 2).map((d) => `- ${d.title}${d.deadline ? ` (join by ${dateLabel(d.deadline)})` : ""}`), `  ${ORG.url}/deals`, ""] : []),
      ...(coming.length ? ["Business events coming up:", ...coming.map((e) => `- ${e.title}, ${new Date(e.starts_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}${e.city ? `, ${e.city}` : ""}${chapterId && e.chapter_id === chapterId ? " (your chapter)" : ""}`), ""] : []),
      ...(groupPosts.length ? ["New in your chapter and groups:", ...groupPosts.map((g) => withWarning(`- ${g.author_name ?? "A member"} in ${extra.groupName.get(g.group_id) ?? "a group"}: ${snippet(g.body)}`, g.kind === "investor")), `  ${ORG.url}/groups`, ""] : []),
      ...(extra.blog.length ? ["From FLAME PH:", ...extra.blog.map((b) => `- ${b.title}: ${ORG.url}/news/${b.slug}`), ""] : []),
      ...(extra.headlines.length ? ["Business news this week:", ...extra.headlines.map((h) => `- ${h.title} (${h.source})\n  ${h.url}`), ""] : []),
      `Your growth path: ${ORG.url}/account/growth`,
      "",
      `You get this because you said yes to FLAME PH updates (News and offers).`,
      `Stop this weekly email with one click: ${unsubscribeUrl(p.id, "digest") ?? `${ORG.url}/account/settings`}`,
      `Choose what we send you: ${ORG.url}/account/settings#notifications`,
    ];
    const ok = await sendEmail({ to: email, subject: newInq ? `${newInq} new inquir${newInq === 1 ? "y" : "ies"} + your FLAME PH week` : "Your FLAME PH week: opportunities, events and business news", text: lines.join("\n"), headers: unsubscribeHeaders(p.id, "digest") });
    if (ok) sent++; else skipped++;
    if (mine.length || newInq) {
      await sendPush(p.id, { title: "Your FLAME PH week", body: newInq ? `${newInq} new inquiries and ${mine.length} opportunities for you` : `${mine.length} new opportunities for you`, url: newInq ? "/account/inquiries" : "/opportunities?mine=1" });
    }
  }
  return NextResponse.json({ ok: true, sent, skipped });
}

const snippet = (t: string) => { const one = t.replace(/\s+/g, " ").trim(); return one.length > 90 ? `${one.slice(0, 87)}…` : one; };

/**
 * The parts of the week every member shares: business news headlines (0023), FLAME PH's own blog posts, and posts in
 * chapter and industry groups (each member sees only the groups they joined). Empty parts are left out of the email.
 */
async function weekExtras(admin: NonNullable<ReturnType<typeof createAdminClient>>, since: Date) {
  const iso = since.toISOString();
  const [{ data: headlines }, { data: blog }, { data: posts }] = await Promise.all([
    admin.from("news_headlines").select("title, source, url, published_at").eq("hidden", false).gte("published_at", iso).order("published_at", { ascending: false }).limit(4),
    admin.from("posts").select("title, slug, published_at").eq("published", true).gte("published_at", iso).order("published_at", { ascending: false }).limit(3),
    admin.from("feed_posts").select("group_id, author_id, author_name, body, kind, created_at").eq("status", "published").eq("audience", "members").not("group_id", "is", null)
      .gte("created_at", iso).order("created_at", { ascending: false }).limit(300),
  ]);
  const groupPosts = (posts ?? []) as { group_id: string; author_id: string; author_name: string | null; body: string; kind: string }[];
  const ids = [...new Set(groupPosts.map((g) => g.group_id))];
  const [{ data: groups }, { data: members }] = ids.length
    ? await Promise.all([admin.from("community_groups").select("id, name").in("id", ids), admin.from("group_members").select("group_id, user_id").in("group_id", ids)])
    : [{ data: [] }, { data: [] }];
  const groupsOf = new Map<string, Set<string>>();
  for (const m of (members ?? []) as { group_id: string; user_id: string }[]) groupsOf.set(m.user_id, (groupsOf.get(m.user_id) ?? new Set()).add(m.group_id));
  return {
    headlines: (headlines ?? []) as { title: string; source: string; url: string }[],
    blog: (blog ?? []) as { title: string; slug: string }[],
    groupPosts,
    groupName: new Map(((groups ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name])),
    groupsOf,
  };
}
