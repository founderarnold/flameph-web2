import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/paging";
import { purgeMemberDocs } from "@/lib/vetting-server";

// Phase 12: the server side of members' data rights. Everything here uses the server key; callers check who asked.

type Q = { table: string; column: string; select?: string; label: string; or?: string };

/**
 * Everything FLAME PH holds about one member, as one machine-readable file (access and portability).
 * Sign-in secrets, encrypted document contents, push keys and hashed IP addresses are left out: they can't be read by
 * anyone and aren't useful to the member.
 */
const PARTS: Q[] = [
  { label: "profile", table: "profiles", column: "id" },
  { label: "consent_history", table: "member_consents", column: "user_id" },
  { label: "notification_choices", table: "notification_prefs", column: "user_id" },
  { label: "businesses", table: "businesses", column: "owner_id" },
  { label: "products", table: "business_products", column: "owner_id" },
  { label: "business_registrations", table: "business_registrations", column: "owner_id" },
  { label: "inquiries_received", table: "business_inquiries", column: "owner_id" },
  { label: "inquiries_sent", table: "business_inquiries", column: "from_user_id" },
  { label: "reviews_written", table: "business_reviews", column: "user_id" },
  { label: "posts", table: "feed_posts", column: "author_id" },
  { label: "comments", table: "feed_comments", column: "author_id" },
  { label: "reactions", table: "feed_reactions", column: "user_id" },
  { label: "following", table: "member_follows", column: "follower_id", select: "followee_id, created_at" },
  { label: "friends", table: "friendships", column: "requester_id", or: "requester_id.eq.{id},addressee_id.eq.{id}" },
  { label: "blocked", table: "member_blocks", column: "blocker_id" },
  { label: "muted", table: "member_mutes", column: "muter_id" },
  { label: "groups", table: "group_members", column: "user_id" },
  { label: "service_requests", table: "service_requests", column: "requester_id", or: "requester_id.eq.{id},provider_id.eq.{id}" },
  { label: "quotes", table: "service_quotes", column: "provider_id" },
  { label: "transaction_records", table: "transaction_records", column: "requester_id", or: "requester_id.eq.{id},provider_id.eq.{id}" },
  { label: "group_orders_joined", table: "deal_participants", column: "user_id" },
  { label: "event_registrations", table: "event_registrations", column: "user_id" },
  { label: "rewards_redeemed", table: "reward_redemptions", column: "user_id" },
  { label: "milestones", table: "member_milestones", column: "user_id" },
  { label: "notifications", table: "member_notifications", column: "user_id" },
  { label: "ai_conversations", table: "ai_conversations", column: "user_id" },
  { label: "ai_messages", table: "ai_messages", column: "user_id", select: "id, conversation_id, feature, question, answer, created_at" },
  { label: "ai_feedback", table: "ai_feedback", column: "user_id" },
  { label: "vetting_documents", table: "vetting_documents", column: "user_id", select: "id, doc_type, file_name, mime, size_bytes, uploaded_at, deleted_at, delete_reason" },
  { label: "partner_applications", table: "partner_applications", column: "user_id", select: "id, category, status, revision, legal_name, trade_name, registration_type, registration_no, tin_last3, industry, website, rep_name, rep_position, biz_email, biz_phone, address_line, city, province, coverage, coverage_areas, details, privacy_ack_at, privacy_version, declaration_at, submitted_at, decided_at, decision_reasons, decision_note, created_at, updated_at" },
  { label: "partner_profile", table: "partner_profiles", column: "user_id", select: "legal_name, categories, status, accredited_at" },
  { label: "investor_registration", table: "investor_registrations", column: "user_id" },
  { label: "reports_you_filed", table: "moderation_reports", column: "reporter_id", select: "id, target_type, reason, details, status, created_at, resolved_at, resolution" },
  { label: "moderation_actions_about_you", table: "moderation_actions", column: "target_owner_id", select: "id, action, note, until, created_at" },
  { label: "appeals", table: "moderation_appeals", column: "appellant_id" },
  { label: "restrictions", table: "member_restrictions", column: "user_id" },
  { label: "ecosystem_links", table: "ecosystem_links", column: "user_id", select: "client, created_at" },
  { label: "data_sent_to_other_sites", table: "ecosystem_access_log", column: "user_id", select: "at, client, purpose, fields, result, reason" },
  { label: "phone_alert_devices", table: "push_subscriptions", column: "user_id", select: "created_at" },
  { label: "form_messages", table: "submissions", column: "user_id", select: "id, type, name, email, mobile, data, status, created_at" },
  { label: "privacy_requests", table: "privacy_requests", column: "user_id", select: "id, kind, details, status, created_at, due_at, closed_at, response" },
];

export async function buildMemberExport(admin: SupabaseClient, userId: string) {
  const { data: au } = await admin.auth.admin.getUserById(userId);
  const u = au.user;
  const out: Record<string, unknown> = {
    about: "Your personal data held by FLAME PH (flameph.org), as of the time below. Under the Data Privacy Act of 2012 you may ask us to correct or erase it: see https://www.flameph.org/account/privacy.",
    generated_at: new Date().toISOString(),
    account: u ? {
      id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, phone: u.phone || null, created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at, sign_in_methods: (u.identities ?? []).map((i) => i.provider),
    } : null,
  };
  const results = await Promise.all(PARTS.map(async (p) => {
    const rows = await fetchAll((a, b) => {
      let q = admin.from(p.table).select(p.select ?? "*");
      q = p.or ? q.or(p.or.replaceAll("{id}", userId)) : q.eq(p.column, userId);
      return q.range(a, b);
    }, 20_000);
    return [p.label, rows] as const;
  }));
  for (const [label, rows] of results) out[label] = rows;

  // Messages: every conversation you are in, with both sides. The other member is shown by name only.
  const convs = await fetchAll((a, b) => admin.from("conversations").select("id, member_a, member_b, created_at")
    .or(`member_a.eq.${userId},member_b.eq.${userId}`).range(a, b), 5_000);
  const others = [...new Set(convs.map((c) => (c.member_a === userId ? c.member_b : c.member_a) as string))];
  const { data: names } = others.length ? await admin.from("profiles").select("id, full_name").in("id", others.slice(0, 1000)) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id as string, (n.full_name as string) || "Member"]));
  const messages = convs.length ? await fetchAll((a, b) => admin.from("direct_messages").select("conversation_id, sender_id, body, created_at, hidden_at")
    .in("conversation_id", convs.map((c) => c.id).slice(0, 1000)).order("created_at").range(a, b), 50_000) : [];
  out.conversations = convs.map((c) => {
    const other = (c.member_a === userId ? c.member_b : c.member_a) as string;
    return {
      with: nameOf.get(other) ?? "Member", started: c.created_at,
      messages: messages.filter((m) => m.conversation_id === c.id).map((m) => ({ from: m.sender_id === userId ? "you" : nameOf.get(other) ?? "Member", body: m.hidden_at ? "(removed by a moderator)" : m.body, at: m.created_at })),
    };
  });
  return out;
}

/** Files under the member's own folder in a storage bucket (photos, post media, business documents). */
async function removeFolder(admin: SupabaseClient, bucket: string, folder: string): Promise<number> {
  let removed = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error || !data?.length) break;
    const paths = data.filter((f) => f.id).map((f) => `${folder}/${f.name}`);
    if (!paths.length) break;
    const { error: e2 } = await admin.storage.from(bucket).remove(paths);
    if (e2) break;
    removed += paths.length;
    if (data.length < 1000) break;
  }
  return removed;
}

export type EraseResult = { ok: true; counts: Record<string, number> } | { ok: false; reason: string };

/**
 * Erases one member: rows that would outlive the account, their files, then the sign-in account itself (which removes
 * everything else that belongs to it). Records the outcome on the request (or a new one) and in the audit log.
 * Not for staff: their role must be removed first.
 */
export async function eraseMember(admin: SupabaseClient, userId: string, opts: { requestId?: string | null; actorId?: string | null; why: string }): Promise<EraseResult> {
  const { data: prof } = await admin.from("profiles").select("member_code").eq("id", userId).maybeSingle();
  const { data: prep, error } = await admin.rpc("privacy_erase_prepare", { p_user: userId });
  if (error) return { ok: false, reason: /has_staff_role/.test(error.message) ? "has_staff_role" : "prepare_failed" };
  const counts: Record<string, number> = { ...(prep as Record<string, number>) };
  counts.vetting_documents = await purgeMemberDocs(admin, userId, "member_removed", "all");
  counts.photos_and_media = await removeFolder(admin, "media", userId);
  counts.private_files = await removeFolder(admin, "private-docs", userId);
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return { ok: false, reason: "delete_failed" };
  const now = new Date().toISOString();
  const response = `Erased on ${now.slice(0, 10)} (${opts.why}). The account, profile, posts, messages, records and files are deleted.`;
  if (opts.requestId) {
    await admin.from("privacy_requests").update({ status: "done", closed_at: now, response, handled_by: opts.actorId ?? null }).eq("id", opts.requestId);
  } else {
    await admin.from("privacy_requests").insert({ user_id: userId, member_code: prof?.member_code ?? null, kind: "erasure", source: "retention", status: "done", due_at: now, closed_at: now, response });
  }
  await admin.from("audit_log").insert({ actor_id: opts.actorId ?? null, action: "privacy_erase", table_name: "auth.users", row_id: userId, detail: { member_code: prof?.member_code ?? null, why: opts.why, counts } });
  return { ok: true, counts };
}

/** The daily privacy job: retention clean-up, closures from switch 1, and erasures that are due. */
export async function runPrivacyJobs(admin: SupabaseClient) {
  const { data: retention, error: rErr } = await admin.rpc("privacy_retention_run", { p_dry: false });
  const closed: string[] = [];
  const { data: closures } = await admin.rpc("privacy_due_closures");
  for (const c of (closures ?? []) as { user_id: string; request_id: string }[]) {
    const { error } = await admin.rpc("privacy_close_account", { p_user: c.user_id, p_request: c.request_id });
    if (!error) {
      await admin.from("privacy_requests").update({ status: "done", closed_at: new Date().toISOString(), response: "Account closed: consent 1 stayed off for 15 working days. Data is erased 1 year after closing unless the member reopens it." }).eq("id", c.request_id);
      closed.push(c.request_id);
    }
  }
  const erased: string[] = [];
  const failed: string[] = [];
  const { data: due } = await admin.rpc("privacy_due_erasures");
  for (const d of (due ?? []) as { user_id: string; request_id: string | null; why: string }[]) {
    const r = await eraseMember(admin, d.user_id, { requestId: d.request_id, why: d.why === "closed_1_year" ? "closed for 1 year" : "member's erasure request" });
    (r.ok ? erased : failed).push(d.request_id ?? "closed_1_year");
  }
  // Phase 13: error reports 90 days, speed readings 30 days (0030). Missing before that update: ignored.
  const { data: monitor } = await admin.rpc("release_monitor_cleanup");
  return { retention: rErr ? { error: rErr.message } : retention, monitor: monitor ?? null, closed: closed.length, erased: erased.length, failed: failed.length };
}
