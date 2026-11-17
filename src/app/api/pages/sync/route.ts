import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifySiteMessage } from "@/lib/sso";
import { PAGES_CLIENT, parseLeadMessage, parseSitesMessage } from "@/lib/minisites";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The FlamePH Pages app (mini-website builder) tells flameph.org, server to server:
 *   { token } where the signed message is typ "sites" (a member's mini-sites) or typ "lead" (a lead from a mini-site).
 * Signed with the Pages app's shared sign-in secret (SSO_SECRET_FLAMEPHPAGES); no new secret. Safe to send twice.
 * A message about an email with no proven flameph.org account is accepted and ignored.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 64_000) return json({ error: "too_large" }, 413);
  const token = String((await req.json().catch(() => null))?.token ?? "");
  let purpose: "lead" | "sites" | null = null, msg: Record<string, unknown> | null = null;
  for (const p of ["lead", "sites"] as const) if (!msg && (msg = verifySiteMessage(PAGES_CLIENT, p, token))) purpose = p;
  if (!purpose || !msg) return json({ error: "bad_signature" }, 401);

  const admin = createAdminClient();
  if (!admin) return json({ error: "unavailable" }, 503);

  if (purpose === "sites") {
    const m = parseSitesMessage(msg);
    if (!m) return json({ error: "bad_message" }, 400);
    const { data: ownerId, error } = await admin.rpc("member_id_for_verified_email", { p_email: m.ownerEmail });
    if (error) return json({ error: "unavailable" }, 503); // database update 0020 not applied yet: Pages tries again tomorrow
    if (!ownerId) return json({ ok: true, matched: false }, 202);
    const now = new Date().toISOString();
    if (m.sites.length) {
      const { error: upErr } = await admin.from("member_minisites").upsert(m.sites.map((s) => ({ ...s, owner_id: ownerId, updated_at: now })), { onConflict: "site_id" });
      if (upErr) return json({ error: "failed" }, 500);
    }
    // Anything this owner no longer has is shown as offline (kept, never deleted).
    let off = admin.from("member_minisites").update({ published: false, updated_at: now }).eq("owner_id", ownerId).eq("published", true);
    if (m.sites.length) off = off.not("site_id", "in", `(${m.sites.map((s) => s.site_id).join(",")})`);
    await off;
    return json({ ok: true, matched: true });
  }

  const lead = parseLeadMessage(msg);
  if (!lead) return json({ error: "bad_message" }, 400);
  const { data: ownerId, error } = await admin.rpc("member_id_for_verified_email", { p_email: lead.ownerEmail });
  if (error) return json({ error: "unavailable" }, 503);
  if (!ownerId) return json({ ok: true, matched: false }, 202);
  const { data: biz } = await admin.from("businesses").select("id").eq("owner_id", ownerId).order("created_at").limit(1).maybeSingle();
  const { error: insErr } = await admin.from("business_inquiries").insert({
    business_id: biz?.id ?? null, owner_id: ownerId, name: lead.name, email: lead.email, mobile: lead.mobile, message: lead.message,
    source: "minisite", external_id: `pages:${lead.leadId}`, minisite_slug: lead.slug,
  });
  if (insErr && insErr.code !== "23505") return json({ error: "failed" }, 500); // 23505: already saved, fine
  // In the app and by push, as the owner chose in Settings. No email from here, the same as before.
  if (!insErr) await notify(ownerId as string, "leads", { title: "New lead from your mini-website", body: `${lead.name}: ${lead.message.slice(0, 120)}`, url: "/account/inquiries" });
  return json({ ok: true, matched: true });
}
