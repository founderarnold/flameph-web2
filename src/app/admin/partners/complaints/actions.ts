"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import {
  ACTION_KINDS, CLOSE_REASONS, COMPLAINT_STATUS, manilaToday, MONEY_ACTIONS, parseAmount, SANCTIONS, SEVERITY, TEAM_MOVES,
  type ActionKind, type ComplaintStatus, type SanctionLevel,
} from "@/lib/partner-cases";

// Admin > Partners: complaints, corrective actions, proposed penalties, sanctions, response targets, penalty terms and
// sample reviews. Only the national team (founder, admin, national reviewer) decides; finance records settlements made
// by MarketplacePH Online Store. Nobody acts on a case about their own business. Every step is in the case history and
// the audit log, and the database checks the same rules again (0035).

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const DESK = ["super_admin", "admin", "national_reviewer", "finance"] as const;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const casePage = (id: string, q: string, hash = "") => `/admin/partners/complaints/${id}?${q}${hash}`;
/** The database's refusal, in a short code for the page (its messages are already plain words). */
const why = (e: { message?: string } | null) => encodeURIComponent((e?.message ?? "failed").replace(/^.*?: /, "").slice(0, 160));

type Case = { id: string; ref_no: string; status: ComplaintStatus; complainant_id: string | null; partner_user_id: string | null; partner_name: string; issue: string | null };
async function loadCase(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect("/admin/partners/complaints");
  const { data } = await ctx.db.from("partner_complaints").select("id, ref_no, status, complainant_id, partner_user_id, partner_name, issue").eq("id", id!).maybeSingle();
  if (!data) redirect("/admin/partners/complaints?error=missing");
  const c = data as Case;
  if (c.complainant_id === ctx.user.id || c.partner_user_id === ctx.user.id) redirect(casePage(c.id, "error=own"));
  return { ctx, c };
}
async function tellBoth(c: Case, title: string, body: string) {
  const url = `/partner-us/complaints/${c.id}`;
  if (c.complainant_id) await tellApplicant(c.complainant_id, title, `${body} (${c.ref_no})`, url, "FLAME PH partner complaint");
  if (c.partner_user_id) await tellApplicant(c.partner_user_id, title, `${body} (${c.ref_no})`, url, "FLAME PH partner complaint");
}

/** Moves the case: start, ask for a fix, resolve (with the outcome), close (with the reason). Appeals: the founder. */
export async function moveCase(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const to = String(fd.get("to") ?? "") as ComplaintStatus;
  const back = (q: string): never => redirect(casePage(c.id, q, "#move"));
  if (!(TEAM_MOVES[c.status] ?? []).includes(to)) back("error=move");
  if (c.status === "appealed" && !ctx.roles.includes("super_admin")) back("error=founder");
  const note = str(fd, "note", 2000);
  const outcome = str(fd, "outcome_note", 2000);
  const reason = String(fd.get("close_reason") ?? "");
  const patch: Record<string, unknown> = { status: to, changed_by: ctx.user.id, change_note: note };
  if (outcome) patch.outcome_note = outcome;
  if (to === "resolved" && !outcome) back("error=outcome");
  if (to === "closed") {
    if (!(reason in CLOSE_REASONS) || reason === "withdrawn") back("error=close_reason");
    patch.close_reason = reason;
    if (reason !== "resolved" && !note && !outcome) back("error=close_note");
  }
  const { error } = await ctx.db.from("partner_complaints").update(patch).eq("id", c.id).eq("status", c.status);
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit(`partner_complaint_${to}`, "partner_complaints", c.id, { from: c.status });
  await tellBoth(c, `Complaint ${COMPLAINT_STATUS[to].label.toLowerCase()}`, to === "resolved" ? "The national team resolved the complaint. Open it to read the outcome. You may appeal within 7 days." : `The complaint is now: ${COMPLAINT_STATUS[to].label}.`);
  revalidatePath("/admin/partners/complaints"); revalidatePath(`/admin/partners/complaints/${c.id}`);
  back("done=moved");
}

/** Severity (moves the due dates) and the person in charge. */
export async function setCaseDetails(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const severity = String(fd.get("severity") ?? "");
  const assigned = uuid(fd.get("assigned_to"));
  if (!(severity in SEVERITY)) redirect(casePage(c.id, "error=severity", "#details"));
  const { error } = await ctx.db.from("partner_complaints").update({ severity, assigned_to: assigned, changed_by: ctx.user.id, change_note: str(fd, "note", 500) }).eq("id", c.id);
  if (error) redirect(casePage(c.id, `error=db&why=${why(error)}`, "#details"));
  await ctx.audit("partner_complaint_details", "partner_complaints", c.id, { severity, assigned });
  revalidatePath(`/admin/partners/complaints/${c.id}`); revalidatePath("/admin/partners/complaints");
  redirect(casePage(c.id, "done=details", "#details"));
}

/** A note from the team: for both sides, or for the team only. */
export async function teamCaseNote(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const note = str(fd, "note", 3000);
  if (!note) redirect(casePage(c.id, "error=note_err", "#history"));
  const internal = fd.get("internal") === "yes";
  const { error } = await ctx.db.from("partner_complaint_events").insert({ complaint_id: c.id, actor_id: ctx.user.id, side: "team", action: "note", note, internal });
  if (error) redirect(casePage(c.id, "error=failed", "#history"));
  if (!internal) await tellBoth(c, "New note from the FLAME PH national team", "The national team added a note to the complaint.");
  revalidatePath(`/admin/partners/complaints/${c.id}`);
  redirect(casePage(c.id, "done=note", "#history"));
}

/** A corrective action (the remedy) for the partner, with a due date. */
export async function addCorrectiveAction(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const back = (q: string): never => redirect(casePage(c.id, q, "#actions"));
  const kind = String(fd.get("kind") ?? "") as ActionKind;
  const description = str(fd, "description", 1000);
  const due = String(fd.get("due_on") ?? "");
  const amount = parseAmount(fd.get("amount"));
  if (!(kind in ACTION_KINDS) || !description) back("error=action_bad");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < manilaToday()) back("error=date");
  if (Number.isNaN(amount) || (amount !== null && !MONEY_ACTIONS.includes(kind))) back("error=amount");
  const { error } = await ctx.db.from("partner_corrective_actions").insert({ complaint_id: c.id, kind, description, due_on: due, amount, created_by: ctx.user.id });
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit("partner_action_add", "partner_complaints", c.id, { kind });
  if (c.partner_user_id) await tellApplicant(c.partner_user_id, "A fix was requested", `The national team asks you to: ${ACTION_KINDS[kind]}. Due ${due}. (${c.ref_no})`, `/partner-us/complaints/${c.id}`, "FLAME PH partner complaint");
  revalidatePath(`/admin/partners/complaints/${c.id}`);
  back("done=action");
}

/** Checks a fix: done (verified), sent back to the partner, not done, or cancelled. */
export async function checkCorrectiveAction(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const back = (q: string): never => redirect(casePage(c.id, q, "#actions"));
  const actionId = uuid(fd.get("action_id"));
  const to = String(fd.get("to") ?? "");
  if (!actionId || !["verified", "open", "not_done", "cancelled"].includes(to)) back("error=action_bad");
  const { error } = await ctx.db.from("partner_corrective_actions").update({ status: to, check_note: str(fd, "check_note", 1000), changed_by: ctx.user.id }).eq("id", actionId!).eq("complaint_id", c.id);
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit("partner_action_check", "partner_complaints", c.id, { to });
  revalidatePath(`/admin/partners/complaints/${c.id}`);
  back("done=checked");
}

/** A PROPOSED penalty. Late delivery: the database works out the figure from the active terms. */
export async function proposePenalty(fd: FormData) {
  const { ctx, c } = await loadCase(uuid(fd.get("id")));
  const back = (q: string): never => redirect(casePage(c.id, q, "#penalty"));
  const kind = fd.get("kind") === "other" ? "other" : "late_delivery";
  const value = parseAmount(fd.get("affected_value"));
  const amount = parseAmount(fd.get("amount"));
  const days = Number(fd.get("days_late"));
  const basis = str(fd, "basis_note", 2000);
  if (!value || Number.isNaN(value) || !basis) back("error=penalty_bad");
  if (kind === "late_delivery" && (!Number.isInteger(days) || days < 1 || days > 3650 || fd.get("attributable") !== "yes")) back("error=penalty_late");
  if (kind === "other" && (amount === null || Number.isNaN(amount))) back("error=amount");
  const { data, error } = await ctx.db.from("partner_penalties").insert({
    complaint_id: c.id, kind, affected_value: value, days_late: kind === "late_delivery" ? days : null, attributable: fd.get("attributable") === "yes",
    amount: kind === "other" ? amount : 0, basis_note: basis, proposed_by: ctx.user.id, partner_name: c.partner_name,
  }).select("id, amount").single();
  if (error || !data) back(`error=db&why=${why(error)}`);
  await ctx.audit("partner_penalty_propose", "partner_penalties", data!.id, { complaint: c.id, amount: data!.amount });
  if (c.partner_user_id) await tellApplicant(c.partner_user_id, "A penalty was proposed", `The national team proposed a penalty on complaint ${c.ref_no}. It is not final: you may answer within 7 days. A record only; any money is settled by MarketplacePH Online Store.`, "/partner-us/complaints#standing", "FLAME PH partner notice");
  revalidatePath(`/admin/partners/complaints/${c.id}`); revalidatePath("/admin/partners/penalties");
  back("done=penalty");
}

/** Penalty steps for the national team: legal review recorded, approve (second person), waive, cancel. Finance:
 *  record the settlement by MarketplacePH Online Store. */
export async function decidePenalty(fd: FormData) {
  const ctx = await adminContext([...DESK]);
  const id = uuid(fd.get("penalty_id"));
  const op = String(fd.get("op") ?? "");
  const from = fd.get("from") === "case" ? "case" : "list";
  const { data: p } = id ? await ctx.db.from("partner_penalties").select("id, complaint_id, partner_user_id, status").eq("id", id).maybeSingle() : { data: null };
  const back = (q: string): never => redirect(from === "case" && p ? casePage(p.complaint_id, q, "#penalty") : `/admin/partners/penalties?${q}`);
  if (!p) back("error=missing");
  const national = ctx.roles.some((r) => (NATIONAL as readonly string[]).includes(r));
  let patch: Record<string, unknown> = { changed_by: ctx.user.id };
  if (op === "legal" && national) patch.legal_reviewed = true;
  else if (op === "approve" && national) patch.status = "approved";
  else if ((op === "waive" || op === "cancel") && national) {
    const note = str(fd, "decision_note", 1000);
    if (!note) back("error=note_err");
    patch = { ...patch, status: op === "waive" ? "waived" : "cancelled", decision_note: note };
  } else if (op === "settle") {
    const ref = str(fd, "settled_ref", 120);
    const on = String(fd.get("settled_on") ?? "");
    if (!ref || !/^\d{4}-\d{2}-\d{2}$/.test(on) || on > manilaToday()) back("error=settle");
    patch = { ...patch, status: "settled", settled_ref: ref, settled_on: on };
  } else back("error=op");
  const { error } = await ctx.db.from("partner_penalties").update(patch).eq("id", p!.id);
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit(`partner_penalty_${op}`, "partner_penalties", p!.id);
  if (p!.partner_user_id && ["approve", "waive", "settle"].includes(op)) {
    await tellApplicant(p!.partner_user_id, op === "approve" ? "A penalty was approved" : op === "waive" ? "A penalty was waived" : "A penalty was settled", "Open your complaints page to see it. A record only; money is settled by MarketplacePH Online Store.", "/partner-us/complaints#standing", "FLAME PH partner notice");
  }
  revalidatePath("/admin/partners/penalties"); revalidatePath(`/admin/partners/complaints/${p!.complaint_id}`);
  back("done=penalty_step");
}

/** A sanction (warning, probation, hold, downgrade, termination). Proposed by one, made active by another. */
export async function proposeSanction(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const partner = uuid(fd.get("partner_user_id"));
  const complaint = uuid(fd.get("complaint_id"));
  const level = String(fd.get("level") ?? "") as SanctionLevel;
  const reason = str(fd, "reason", 2000);
  const ends = String(fd.get("ends_on") ?? "").trim() || null;
  const back = (q: string): never => redirect(complaint && fd.get("from") === "case" ? casePage(complaint, q, "#sanction") : `/admin/partners/sanctions?${q}`);
  if (!partner || !(level in SANCTIONS) || !reason) back("error=sanction_bad");
  if (partner === ctx.user.id) back("error=own");
  if (ends && (!/^\d{4}-\d{2}-\d{2}$/.test(ends) || ends <= manilaToday())) back("error=date");
  const { data: prof } = await ctx.db.from("partner_profiles").select("legal_name").eq("user_id", partner!).maybeSingle();
  if (!prof) back("error=sanction_bad");
  const { data, error } = await ctx.db.from("partner_sanctions").insert({
    partner_user_id: partner, partner_name: prof!.legal_name, complaint_id: complaint, level, reason, ends_on: ends, urgent: fd.get("urgent") === "yes", proposed_by: ctx.user.id,
  }).select("id").single();
  if (error || !data) back(`error=db&why=${why(error)}`);
  await ctx.audit("partner_sanction_propose", "partner_sanctions", data!.id, { level });
  await tellApplicant(partner!, `Notice: a ${SANCTIONS[level].label.toLowerCase()} was proposed`, "The national team proposed a notice about your accreditation. Open it to read the reason and give your answer.", "/partner-us/complaints#standing", "FLAME PH partner notice");
  revalidatePath("/admin/partners/sanctions");
  back("done=sanction");
}

/** Make active (a second national team member; the founder for a termination), cancel, or lift. */
export async function decideSanction(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("sanction_id"));
  const op = String(fd.get("op") ?? "");
  const { data: s } = id ? await ctx.db.from("partner_sanctions").select("id, partner_user_id, level, complaint_id").eq("id", id).maybeSingle() : { data: null };
  const back = (q: string): never => redirect(`/admin/partners/sanctions?${q}`);
  if (!s) back("error=missing");
  if (s!.partner_user_id === ctx.user.id) back("error=own");
  const note = str(fd, "lift_note", 1000);
  const patch: Record<string, unknown> = { changed_by: ctx.user.id };
  if (op === "activate") patch.status = "active";
  else if (op === "cancel" || op === "lift") {
    if (!note) back("error=note_err");
    patch.status = op === "cancel" ? "cancelled" : "lifted"; patch.lift_note = note;
  } else back("error=op");
  const { error } = await ctx.db.from("partner_sanctions").update(patch).eq("id", s!.id);
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit(`partner_sanction_${op}`, "partner_sanctions", s!.id, { level: s!.level });
  if (s!.partner_user_id && op !== "cancel") {
    await tellApplicant(s!.partner_user_id, op === "activate" ? `Notice: ${SANCTIONS[s!.level as SanctionLevel].label} is now active` : `Notice lifted: ${SANCTIONS[s!.level as SanctionLevel].label}`, "Open your complaints page to read it.", "/partner-us/complaints#standing", "FLAME PH partner notice");
  }
  revalidatePath("/admin/partners/sanctions");
  back("done=sanction_step");
}

/** Response targets per severity (hours to the first reply, days to resolve, alert at once). */
export async function saveTargets(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  for (const sev of Object.keys(SEVERITY)) {
    const h = Number(fd.get(`h_${sev}`)); const d = Number(fd.get(`d_${sev}`));
    if (!Number.isInteger(h) || h < 1 || h > 720 || !Number.isInteger(d) || d < 1 || d > 365) redirect("/admin/partners/complaints/settings?error=targets_bad");
    const { error } = await ctx.db.from("complaint_targets").update({ first_response_hours: h, resolve_days: d, alert_now: fd.get(`a_${sev}`) === "yes", updated_by: ctx.user.id }).eq("severity", sev);
    if (error) redirect(`/admin/partners/complaints/settings?error=db&why=${why(error)}`);
  }
  await ctx.audit("complaint_targets_update", "complaint_targets");
  revalidatePath("/admin/partners/complaints/settings");
  redirect("/admin/partners/complaints/settings?done=targets");
}

/** New penalty terms (the default, or one partner's signed agreement), made active by a second person. */
export async function proposeTerms(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const back = (q: string): never => redirect(`/admin/partners/complaints/settings?${q}#terms`);
  const scope = fd.get("scope") === "agreement" ? "agreement" : "default";
  const rate = Number(fd.get("rate")); const cap = Number(fd.get("cap"));
  if (!(rate > 0 && rate <= 5 && cap > 0 && cap <= 50 && cap >= rate)) back("error=terms_bad");
  const partner = uuid(fd.get("partner_user_id"));
  const row: Record<string, unknown> = { scope, late_rate_pct_per_day: rate, late_cap_pct: cap, note: str(fd, "note", 1000), created_by: ctx.user.id };
  if (scope === "agreement") {
    const { data: prof } = partner ? await ctx.db.from("partner_profiles").select("legal_name").eq("user_id", partner).maybeSingle() : { data: null };
    const ref = str(fd, "contract_ref", 80); const signed = String(fd.get("signed_on") ?? "");
    if (!prof || !ref || !/^\d{4}-\d{2}-\d{2}$/.test(signed)) back("error=terms_bad");
    Object.assign(row, { partner_user_id: partner, partner_name: prof!.legal_name, contract_ref: ref, signed_on: signed });
  }
  const { data, error } = await ctx.db.from("partner_penalty_terms").insert(row).select("id").single();
  if (error || !data) back(`error=db&why=${why(error)}`);
  await ctx.audit("penalty_terms_propose", "partner_penalty_terms", data!.id, { scope, rate, cap });
  back("done=terms");
}

export async function decideTerms(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("terms_id"));
  const op = fd.get("op") === "activate" ? "activate" : fd.get("op") === "retire" ? "retire" : "cancel";
  const patch = op === "activate" ? { status: "active", approved_by: ctx.user.id } : { status: op === "retire" ? "retired" : "cancelled" };
  const { error } = id ? await ctx.db.from("partner_penalty_terms").update(patch).eq("id", id) : { error: { message: "missing" } };
  if (error) redirect(`/admin/partners/complaints/settings?error=db&why=${why(error)}#terms`);
  await ctx.audit(`penalty_terms_${op}`, "partner_penalty_terms", id!);
  revalidatePath("/admin/partners/complaints/settings");
  redirect("/admin/partners/complaints/settings?done=terms_step#terms");
}

/** The national team reviews a sample test (never their own) and may share the result with the partner. */
export async function reviewSample(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("sample_id"));
  if (!id) redirect("/admin/partners/samples");
  const back = (q: string): never => redirect(`/admin/partners/samples/${id}?${q}`);
  const { data: t } = await ctx.db.from("partner_sample_tests").select("id, status, tester_id, partner_user_id, product_name, ref_no").eq("id", id!).maybeSingle();
  if (!t) redirect("/admin/partners/samples?error=missing");
  if (t!.tester_id === ctx.user.id || t!.partner_user_id === ctx.user.id) back("error=own");
  const share = fd.get("partner_visible") === "yes";
  const patch: Record<string, unknown> = { review_note: str(fd, "review_note", 2000), partner_visible: share };
  if (t!.status === "submitted") Object.assign(patch, { status: "reviewed", reviewed_by: ctx.user.id });
  else if (t!.status !== "reviewed") back("error=status");
  const { error } = await ctx.db.from("partner_sample_tests").update(patch).eq("id", t!.id);
  if (error) back(`error=db&why=${why(error)}`);
  await ctx.audit("partner_sample_review", "partner_sample_tests", t!.id, { share });
  if (share && t!.partner_user_id) await tellApplicant(t!.partner_user_id, "Sample test result shared", `The national team shared the test result for ${t!.product_name} (${t!.ref_no}).`, "/partner-us/samples", "FLAME PH sample test");
  revalidatePath("/admin/partners/samples"); revalidatePath(`/admin/partners/samples/${t!.id}`);
  back("done=reviewed");
}
