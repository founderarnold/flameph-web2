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
  { label: "supplier_offers", table: "supplier_offers", column: "user_id", select: "id, kind, status, revision, title, product_group, service_category, signature_category, formulation_ownership, formulation_note, rnd_support, qc_testing, lab_partner, traceability, batch_record_years, recall_plan, recall_contact, mock_recall_on, packaging_supply, ip_terms_version, ip_terms_accepted_at, profession, qualifications, license_required, license_body, license_no, license_valid_until, portfolio, service_mode, free_trial, trial_terms, availability, monthly_clients, response_hours, service_levels, correction_policy, refund_policy, confidentiality, handles_personal_data, valid_until, vat_basis, serviceable_areas, shipping_terms, shipping_note, lead_time_days, warranty, returns_policy, sample_availability, sample_terms, certifications, commission_pct, commission_note, declaration_at, submitted_at, decided_at, decision_reasons, decision_note, selection_reason, created_at, updated_at, supplier_offer_items(product_name, brand, sku, description, sell_unit, base_unit, base_qty, regular_price, wholesale_price, member_price, tiers, moq, monthly_capacity, stock_status, lead_time_days, shipping_per_unit), service_offer_packages(name, description, scope, exclusions, rate_basis, unit_label, normal_rate, member_rate, min_units, duration_days, milestones, acceptance_criteria, revisions_included), service_offer_references(client_name, client_contact, work_done, completed_on, verification, client_rating), signature_sites(site_name, site_type, operator_name, address, place_label, lto_no, lto_valid_until, certifications, monthly_capacity, production_lines), signature_products(product_name, description, product_type, fda_needed, cpr_status, cpr_no, cpr_holder, net_content, packaging, shelf_life_months, storage, batch_size, moq, toll_price, price_includes, suggested_srp, lead_time_days, sample_qty, approval, approval_note, approved_at)" },
  { label: "signature_licences", table: "signature_licences", column: "partner_user_id", select: "id, ref_no, partner_name, offer_id, product_ids, site_ids, start_date, end_date, terms_note, status, status_reason, approved_at, changed_at, created_at" },
  { label: "signature_batches", table: "signature_batches", column: "partner_user_id", select: "id, ref_no, product_name, batch_type, lot_no, produced_on, expiry_on, quantity, unit, raw_material_lots, qc_result, qc_note, status, status_reason, status_at, recall_scope, created_at" },
  { label: "territories", table: "territorial_appointments", column: "partner_user_id", select: "id, parent_id, partner_category, rights, category_label, exclusivity, channels, online_sales, online_note, excluded_accounts, start_date, end_date, target_period, target_net_sales, target_members, target_note, review_every, next_review_date, terms_note, status, status_reason, approved_at, ended_at, created_at, territory_areas(level, code, label), territory_reviews(period_start, period_end, actual_net_sales, actual_members, rating, outcome, note, created_at)" },
  { label: "commission_records", table: "commission_entries", column: "partner_user_id", select: "id, kind, partner_name, partner_category, channel, reference, sale_date, collected_on, buyer_name, place_label, gross_amount, deductions, net_amount, description, status, total_pct, commission_total, approved_at, created_at, commission_lines(level, recipient_label, pct, amount)" },
  { label: "commission_agreements", table: "commission_rules", column: "partner_user_id", select: "id, partner_category, partner_name, contract_ref, signed_on, national_pct, regional_pct, provincial_pct, city_pct, total_pct, effective_from, effective_to, basis_note, status, approved_at" },
  { label: "sub_partner_nominations", table: "territory_nominations", column: "nominator_id", select: "id, parent_id, nominee_name, nominee_contact, nominee_phone, nominee_email, proposed_area, reason, status, decided_at, decision_note, created_at" },
  { label: "partner_complaints_filed", table: "partner_complaints", column: "complainant_id", select: "id, ref_no, partner_name, order_reference, order_date, product_or_service, issue, description, desired_remedy, remedy_note, affected_value, consent_at, consent_version, severity, status, close_reason, outcome_note, submitted_at, first_responded_at, resolved_at, appealed_at, appeal_reason, closed_at, partner_response, partner_responded_at, created_at, updated_at" },
  { label: "partner_complaints_about_your_business", table: "partner_complaints", column: "partner_user_id", or: "and(partner_user_id.eq.{id},status.neq.draft)", select: "id, ref_no, partner_name, order_reference, order_date, product_or_service, issue, description, desired_remedy, remedy_note, affected_value, consent_at, consent_version, severity, status, close_reason, outcome_note, submitted_at, first_responded_at, resolved_at, appealed_at, appeal_reason, closed_at, partner_response, partner_responded_at, created_at, updated_at" },
  { label: "partner_sample_tests_done", table: "partner_sample_tests", column: "tester_id", select: "id, ref_no, partner_name, product_name, batch_lot, received_on, expiry_on, arrival_condition, matches_description, label_complete, score_packaging, score_appearance, score_quality, score_performance, score_labeling, total, would_recommend, feedback_tags, feedback, safety_concern, safety_note, status, submitted_at, reviewed_at, created_at" },
  { label: "partner_penalties", table: "partner_penalties", column: "partner_user_id", select: "id, kind, affected_value, days_late, rate_pct_per_day, cap_pct, attributable, amount, basis_note, status, legal_reviewed, approved_at, decided_at, decision_note, settled_ref, settled_on, partner_response, partner_responded_at, created_at" },
  { label: "partner_sanctions", table: "partner_sanctions", column: "partner_user_id", select: "id, level, reason, ends_on, status, urgent, approved_at, lifted_at, lift_note, partner_response, partner_responded_at, created_at" },
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
