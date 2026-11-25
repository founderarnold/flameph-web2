import "server-only";
import { resolveMx } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moderateBusinessContent } from "@/lib/business-moderation";
import { createAdminClient } from "@/lib/supabase/server";
import { businessExtraSignals, decide, emailSignals, personSignals, ADMIN_HOLD_ACTIONS, ADMIN_RELEASE_ACTIONS, type ReviewDecision } from "@/lib/listing-review-rules";

// Runs the automatic directory check on one listing and acts on it:
//   publish -> approved and on the public directory now (no admin needed)
//   hold    -> waits in Admin > Directory verification with the reasons stored on the listing
//   high    -> kept off the directory as before (owner must correct it)
//   skip    -> an admin decision or an older flagged listing: nothing is changed
// Every run is recorded (business_moderation_events + audit_log) through the existing record_business_moderation.

const SELECT = "id,owner_id,name,sector,subsector,description,products,city,province,contact_email,contact_phone,contact_viber,contact_messenger,website_url,facebook_url,photos,logo_url,lifecycle_status,publication_status,published,risk_level";
export const AUTO_REVIEW_VERSION = "auto-v2";

// Big free email providers always receive mail: no need to look them up.
const KNOWN_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.ph", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "aol.com", "gmx.com", "zoho.com", "mail.com"]);
const mxCache = new Map<string, boolean | null>();
const lookup = (domain: string) => Promise.race([
  resolveMx(domain).then((r) => r.length > 0, (e: NodeJS.ErrnoException) => (e?.code === "ENOTFOUND" || e?.code === "ENODATA" ? false : null)),
  new Promise<null>((r) => setTimeout(() => r(null), 3000)),
]);
/** true = the domain can receive mail, false = it cannot (no such domain / no mail server), null = could not check. */
async function domainAcceptsMail(email: string | null | undefined): Promise<boolean | null> {
  const domain = (email ?? "").split("@")[1]?.toLowerCase();
  if (!domain) return null;
  if (KNOWN_MAIL.has(domain)) return true;
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  // If even gmail.com cannot be looked up, the lookup service is down: never blame the member for that.
  if (!mxCache.has("@probe")) mxCache.set("@probe", await lookup("gmail.com"));
  const result = mxCache.get("@probe") === true ? await lookup(domain) : null;
  mxCache.set(domain, result);
  return result;
}

export type AutoReviewResult = { id: string; name: string; outcome: ReviewDecision["outcome"] | "error"; codes: string[] };

export async function autoReviewListing(db: SupabaseClient, businessId: string): Promise<AutoReviewResult> {
  const { data: b } = await db.from("businesses").select(SELECT).eq("id", businessId).maybeSingle();
  if (!b) return { id: businessId, name: "", outcome: "error", codes: ["not_found"] };
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const [{ data: owner }, { data: others }, { count: recent }, { data: legacy }, { data: adminRows }, authUser] = await Promise.all([
    db.from("profiles").select("full_name,city,mobile,status,email_verified_at").eq("id", b.owner_id).maybeSingle(),
    db.from("businesses").select("id,name,description,contact_email,contact_phone,contact_messenger,website_url,facebook_url").neq("id", b.id).limit(2000),
    db.from("business_moderation_events").select("id", { count: "exact", head: true }).eq("owner_id", b.owner_id).gte("created_at", tenMinutesAgo),
    db.from("business_legacy_assessments").select("classification,review_state").eq("business_id", b.id).maybeSingle(),
    db.from("audit_log").select("action,created_at").eq("table_name", "businesses").eq("row_id", b.id).not("actor_id", "is", null)
      .in("action", [...ADMIN_HOLD_ACTIONS, ...ADMIN_RELEASE_ACTIONS]).order("created_at", { ascending: false }).limit(1),
    db.auth.admin.getUserById(b.owner_id).catch(() => ({ data: { user: null } })),
  ]);
  const user = authUser.data?.user ?? null;
  const email = user?.email ?? null;
  const confirmed = Boolean(owner?.email_verified_at || user?.email_confirmed_at);
  const content = moderateBusinessContent(b, { others: others ?? [], recentSubmissions: recent ?? 0 });
  const extra = [
    ...emailSignals({ email, confirmed, domainAcceptsMail: await domainAcceptsMail(email) }),
    ...personSignals(owner ?? {}),
    ...businessExtraSignals(b),
  ];
  const decision = decide({
    lifecycle: String(b.lifecycle_status),
    ownerActive: owner?.status === "active",
    legacyState: (legacy?.review_state as "pending" | "cleared" | "confirmed" | undefined) ?? "none",
    legacyClass: legacy?.classification ?? null,
    lastAdminAction: adminRows?.[0]?.action ?? null,
    content,
    extra,
  });
  if (decision.outcome === "skip") return { id: b.id, name: b.name, outcome: "skip", codes: decision.codes };

  const fields = [...new Set([...content.suspiciousFields, ...extra.filter((s) => s.code.startsWith("email") || s.code.startsWith("owner")).map(() => "profile")])];
  const { error } = await db.rpc("record_business_moderation", {
    p_business_id: b.id,
    p_owner_id: b.owner_id,
    p_risk_level: decision.riskLevel,
    p_reason_categories: decision.codes,
    p_suspicious_fields: fields,
    p_assessment_version: AUTO_REVIEW_VERSION,
    p_snapshot: { ...b, owner_email_confirmed: confirmed },
  });
  if (error) return { id: b.id, name: b.name, outcome: "error", codes: decision.codes };

  if (decision.outcome === "publish" && !(b.published && b.lifecycle_status === "approved")) {
    const res = await db.from("businesses").update({ lifecycle_status: "approved", publication_status: "published", published: true }).eq("id", b.id).select("published").maybeSingle();
    if (res.error || !res.data?.published) return { id: b.id, name: b.name, outcome: "error", codes: decision.codes };
    await db.from("audit_log").insert({ actor_id: null, action: "business_auto_published", table_name: "businesses", row_id: b.id, detail: { owner_id: b.owner_id, version: AUTO_REVIEW_VERSION, notes: decision.codes } });
  } else if (decision.outcome === "hold" && !["needs_correction", "pending_review"].includes(String(b.lifecycle_status))) {
    // Waiting for an admin: shown under "Needs a look" with the reasons. (risk "needs_review" already keeps it off the directory.)
    await db.from("businesses").update({ lifecycle_status: "pending_review" }).eq("id", b.id);
  }
  return { id: b.id, name: b.name, outcome: decision.outcome, codes: decision.codes };
}

/**
 * Checks every listing that is not public yet. Used by the admin button and the hourly job. Listings an admin asked to
 * correct ("needs_correction") are checked again only when their owner saves them.
 */
export async function autoReviewWaiting(db: SupabaseClient, limit = 200): Promise<AutoReviewResult[]> {
  const { data } = await db.from("businesses").select("id").in("lifecycle_status", ["draft", "submitted", "pending_review"])
    .eq("published", false).neq("risk_level", "high").order("updated_at", { ascending: false }).limit(limit);
  const out: AutoReviewResult[] = [];
  for (const row of data ?? []) out.push(await autoReviewListing(db, row.id));
  return out;
}

/** After a member saves their own listing: run the check with the server key. Never throws; null if it could not run. */
export async function checkListingAfterSave(businessId: string): Promise<AutoReviewResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  return autoReviewListing(admin, businessId).catch(() => null);
}
