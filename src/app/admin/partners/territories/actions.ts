"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { PRODUCT_GROUPS } from "@/lib/offers";
import { areaCodes } from "@/lib/ph-geo";
import {
  addMonths, CHANNEL_KEYS, categoryFrom, dbReason, EXCLUSIVITY, isDate, manilaToday, ONLINE_SALES, OUTCOMES, PARTNER_KINDS, parseAmount, parseExcluded,
  parseWhole, RATINGS, REVIEW_EVERY, RIGHTS, TARGET_PERIOD, type PartnerKind, type ReviewEvery,
} from "@/lib/territory";

// Admin > Partners > Territories. Only the national team (founder, admins, national reviewers) creates, approves,
// suspends, ends and reviews appointments, and decides on sub-partner nominations. Every step is in territory_history
// and the audit log, and the database checks the same rules again (0033), including the overlap check.

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const HOME = "/admin/partners/territories";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const page = (id: string, q: string, hash = "") => `${HOME}/${id}?${q}${hash}`;
const dbError = (id: string, message: string | undefined, hash = "") => {
  const r = dbReason(message);
  return page(id, r ? `error=db&m=${encodeURIComponent(r)}` : "error=failed", hash);
};

/** A Best Offer link only when the offer belongs to this partner. */
async function ownOfferId(ctx: Awaited<ReturnType<typeof adminContext>>, offerId: string | null, partner: string) {
  if (!offerId) return null;
  const { data } = await ctx.db.from("supplier_offers").select("user_id").eq("id", offerId).maybeSingle();
  return data?.user_id === partner ? offerId : null;
}

type Appt = { id: string; partner_user_id: string; parent_id: string | null; status: string; category_label: string; start_date: string | null; end_date: string | null; review_every: string | null; next_review_date: string | null };

async function load(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect(HOME);
  const { data } = await ctx.db.from("territorial_appointments").select("id, partner_user_id, parent_id, status, category_label, start_date, end_date, review_every, next_review_date").eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}?error=missing`);
  if (data!.partner_user_id === ctx.user.id) redirect(page(id!, "error=own"));   // nobody handles their own appointment
  return { ctx, a: data as Appt };
}
const done = (id: string, q: string, hash = ""): never => {
  revalidatePath(HOME); revalidatePath(`${HOME}/${id}`); revalidatePath("/partner-us/territories");
  redirect(page(id, q, hash));
};
async function history(ctx: Awaited<ReturnType<typeof adminContext>>, appointment_id: string, action: string, note: string | null, internal = false, snapshot: unknown = null) {
  await ctx.db.from("territory_history").insert({ appointment_id, actor_id: ctx.user.id, action, note, internal, snapshot });
}

/** Starts a draft appointment for an accredited partner (optionally under a main appointment, from a nomination). */
export async function createAppointment(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const back = (q: string): never => redirect(`${HOME}/new?${q}`);
  const partner = uuid(fd.get("partner"));
  const kind = pick(fd.get("partner_category"), PARTNER_KINDS) as PartnerKind | null;
  const parentId = uuid(fd.get("parent_id"));
  const nominationId = uuid(fd.get("nomination_id"));
  const offerId = uuid(fd.get("offer_id"));
  if (!partner || !kind) back("error=partner");
  if (partner === ctx.user.id) back("error=own");
  const { data: prof } = await ctx.db.from("partner_profiles").select("status, categories").eq("user_id", partner!).maybeSingle();
  if (!prof || prof.status !== "accredited" || !(prof.categories as string[]).includes(kind!)) back("error=not_accredited");

  let row: Record<string, unknown> = { partner_user_id: partner, partner_category: kind, created_by: ctx.user.id, offer_id: await ownOfferId(ctx, offerId, partner!) };
  if (parentId) {
    const { data: p } = await ctx.db.from("territorial_appointments").select("id, partner_user_id, parent_id, status, rights, category_key, category_label, channels, online_sales, online_note, start_date, end_date, review_every").eq("id", parentId).maybeSingle();
    if (!p || p.status !== "active" || p.parent_id) back("error=parent");
    if (p!.partner_user_id === partner) back("error=same_partner");
    // A sub-partner starts with the main appointment's category, rights, channels and dates; the team narrows them.
    row = { ...row, parent_id: p!.id, nomination_id: nominationId, rights: p!.rights, category_key: p!.category_key, category_label: p!.category_label,
      channels: p!.channels, online_sales: p!.online_sales, online_note: p!.online_note, start_date: p!.start_date, end_date: p!.end_date, review_every: p!.review_every, exclusivity: "non_exclusive" };
  } else {
    const cat = categoryFrom(String(fd.get("group") ?? ""), String(fd.get("category_name") ?? ""), PRODUCT_GROUPS, kind!);
    if (!cat) back("error=category");
    row = { ...row, category_key: cat!.key, category_label: cat!.label, rights: kind === "toll_manufacturer" && fd.get("rights") === "manufacturing" ? "manufacturing" : "distribution" };
  }
  const { data: made, error } = await ctx.db.from("territorial_appointments").insert(row).select("id").single();
  if (error || !made) back(`error=db&m=${encodeURIComponent(dbReason(error?.message) ?? "That didn't go through.")}`);
  if (nominationId) await ctx.db.from("territory_nominations").update({ appointment_id: made!.id }).eq("id", nominationId).eq("status", "accepted").is("appointment_id", null);
  await history(ctx, made!.id, "created", parentId ? "Draft started for a sub-partner under a main appointment." : "Draft started.", true);
  await ctx.audit("territory_created", "territorial_appointments", made!.id, { partner, kind, parent: parentId });
  done(made!.id, "done=created");
}

/** Draft only: category, rights, exclusivity, channels, the online-sales rule, excluded accounts and the Best Offer link. */
export async function saveTerms(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(a.id, q, "#terms"));
  if (a.status !== "draft") back("error=locked");
  const { data: full } = await ctx.db.from("territorial_appointments").select("partner_category").eq("id", a.id).single();
  const kind = full!.partner_category as PartnerKind;
  const patch: Record<string, unknown> = {
    exclusivity: pick(fd.get("exclusivity"), EXCLUSIVITY) ?? "non_exclusive",
    channels: [...new Set(fd.getAll("channels").map(String))].filter((c) => (CHANNEL_KEYS as string[]).includes(c)),
    online_sales: pick(fd.get("online_sales"), ONLINE_SALES),
    online_note: str(fd, "online_note", 500),
    excluded_accounts: parseExcluded(String(fd.get("excluded") ?? "")),
    offer_id: await ownOfferId(ctx, uuid(fd.get("offer_id")), a.partner_user_id),
  };
  if (!a.parent_id) {
    const cat = categoryFrom(String(fd.get("group") ?? ""), String(fd.get("category_name") ?? ""), PRODUCT_GROUPS, kind);
    if (!cat) back("error=category");
    patch.category_key = cat!.key; patch.category_label = cat!.label;
    patch.rights = kind === "toll_manufacturer" ? pick(fd.get("rights"), RIGHTS) ?? "distribution" : "distribution";
  }
  const { error } = await ctx.db.from("territorial_appointments").update(patch).eq("id", a.id).eq("status", "draft");
  if (error) redirect(dbError(a.id, error.message, "#terms"));
  done(a.id, "done=terms", "#terms");
}

/** Draft only: dates, targets, review schedule and notes. */
export async function saveDates(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(a.id, q, "#dates"));
  if (a.status !== "draft") back("error=locked");
  const start = String(fd.get("start_date") ?? "").trim();
  const end = String(fd.get("end_date") ?? "").trim();
  if ((start && !isDate(start)) || (end && !isDate(end))) back("error=date");
  if (start && end && end <= start) back("error=date_order");
  if (start && end && end > addMonths(start, 120)) back("error=date_long");
  const sales = parseAmount(fd.get("target_net_sales"));
  const members = parseWhole(fd.get("target_members"));
  if (sales === undefined || members === undefined) back("error=number");
  const every = pick(fd.get("review_every"), REVIEW_EVERY) as ReviewEvery | null;
  let next = String(fd.get("next_review_date") ?? "").trim() || null;
  if (next && !isDate(next)) back("error=date");
  if (!next && start && every) next = addMonths(start, REVIEW_EVERY[every].months);
  const { error } = await ctx.db.from("territorial_appointments").update({
    start_date: start || null, end_date: end || null, target_period: pick(fd.get("target_period"), TARGET_PERIOD), target_net_sales: sales, target_members: members,
    target_note: str(fd, "target_note", 1000), review_every: every, next_review_date: next, terms_note: str(fd, "terms_note", 2000), internal_note: str(fd, "internal_note", 2000),
  }).eq("id", a.id).eq("status", "draft");
  if (error) redirect(dbError(a.id, error.message, "#dates"));
  done(a.id, "done=dates", "#dates");
}

/** Draft only: adds one area by its official code. */
export async function addArea(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const level = String(fd.get("level") ?? "");
  const code = String(fd.get("code") ?? "").trim() || null;
  if (a.status !== "draft") redirect(page(a.id, "error=locked", "#areas"));
  if (!["national", "region", "province", "city"].includes(level) || !areaCodes(level, code)) redirect(page(a.id, "error=area", "#areas"));
  const { error } = await ctx.db.from("territory_areas").insert({ appointment_id: a.id, level, code: level === "national" ? null : code });
  if (error) redirect(error.code === "23505" ? page(a.id, "error=area_twice", "#areas") : dbError(a.id, error.message, "#areas"));
  done(a.id, "done=area", "#areas");
}

export async function removeArea(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const areaId = uuid(fd.get("area_id"));
  if (a.status !== "draft" || !areaId) redirect(page(a.id, "error=locked", "#areas"));
  const { error } = await ctx.db.from("territory_areas").delete().eq("id", areaId!).eq("appointment_id", a.id);
  if (error) redirect(dbError(a.id, error.message, "#areas"));
  done(a.id, "done=area_removed", "#areas");
}

/** The national team's approval. Needs the approver's no-conflict declaration; an overlap with an exclusive appointment
 *  needs "approve the overlap" and a written reason. The database runs the same overlap check again. */
export async function approveAppointment(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(a.id, q, "#approve"));
  if (a.status !== "draft") back("error=status");
  if (fd.get("no_conflict") !== "yes") back("error=coi");
  const { data: clash, error: cErr } = await ctx.db.rpc("territory_conflicts", { p_id: a.id });
  if (cErr) back("error=failed");
  const overlap = (clash ?? []).length > 0;
  const overlapOk = overlap && fd.get("overlap_ok") === "yes";
  const reason = str(fd, "overlap_reason", 1000);
  if (overlap && !overlapOk) back("error=overlap");
  if (overlapOk && !reason) back("error=overlap_reason");
  const patch: Record<string, unknown> = { status: "active", changed_by: ctx.user.id, approver_declared_at: new Date().toISOString() };
  if (overlapOk) { patch.overlap_approved = true; patch.overlap_reason = reason; }
  if (!a.next_review_date && a.start_date && a.review_every) patch.next_review_date = addMonths(a.start_date, REVIEW_EVERY[a.review_every as ReviewEvery].months);
  const { error } = await ctx.db.from("territorial_appointments").update(patch).eq("id", a.id).eq("status", "draft");
  if (error) redirect(dbError(a.id, error.message, "#approve"));
  const [{ data: snap }, { data: areas }] = await Promise.all([
    ctx.db.from("territorial_appointments").select("*").eq("id", a.id).single(),
    ctx.db.from("territory_areas").select("level, code, label").eq("appointment_id", a.id),
  ]);
  await history(ctx, a.id, "approved", overlapOk ? `Approved. Overlap approved: ${reason}` : "Approved.", false, { appointment: snap, areas });
  await ctx.audit("territory_approved", "territorial_appointments", a.id, { overlap: overlapOk, conflicts: (clash ?? []).map((c: { other_id: string }) => c.other_id) });
  await tellApplicant(a.partner_user_id, "You were appointed to a territory", `The FLAME PH national team approved your territory for ${a.category_label}. Open My territories to see the area, channels, dates and targets.`, "/partner-us/territories", "FLAME PH territory");
  done(a.id, "done=approved");
}

const MOVES = {
  suspend: { from: ["active"], to: "suspended", action: "suspended", needsReason: true, tell: "Your territory was suspended" },
  resume: { from: ["suspended"], to: "active", action: "resumed", needsReason: false, tell: "Your territory is active again" },
  end: { from: ["active", "suspended"], to: "ended", action: "ended", needsReason: true, tell: "Your territory has ended" },
  cancel: { from: ["draft"], to: "cancelled", action: "cancelled", needsReason: true, tell: null },
} as const;

/** Suspend, resume, end, or cancel a draft. Reasons are required (except to resume) and shown to the partner. */
export async function changeStatus(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const move = pick(fd.get("move"), MOVES) as keyof typeof MOVES | null;
  const back = (q: string): never => redirect(page(a.id, q, "#status"));
  if (!move) back("error=failed");
  const m = MOVES[move!];
  if (!(m.from as readonly string[]).includes(a.status)) back("error=status");
  const reason = str(fd, "reason", 1000);
  if (m.needsReason && !reason) back("error=reason");
  if (move === "end" && fd.get("confirm") !== "yes") back("error=confirm");
  const patch: Record<string, unknown> = { status: m.to, changed_by: ctx.user.id };
  if (reason) patch.status_reason = reason;
  const { error } = await ctx.db.from("territorial_appointments").update(patch).eq("id", a.id).eq("status", a.status);
  if (error) redirect(dbError(a.id, error.message, "#status"));
  await history(ctx, a.id, m.action, reason, move === "cancel");
  await ctx.audit(`territory_${m.action}`, "territorial_appointments", a.id, { reason });
  if (m.tell) await tellApplicant(a.partner_user_id, m.tell, `${a.category_label}${reason ? `: ${reason}` : ""}. Open My territories for details.`, "/partner-us/territories", "FLAME PH territory");
  done(a.id, `done=${m.action}`);
}

/** Copies an approved appointment into a new draft for the next period (renewal). The old one stays as it is. */
export async function renewAppointment(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  if (!["active", "suspended", "ended"].includes(a.status)) redirect(page(a.id, "error=status"));
  const { data: o } = await ctx.db.from("territorial_appointments").select("*").eq("id", a.id).single();
  const { data: areas } = await ctx.db.from("territory_areas").select("level, code").eq("appointment_id", a.id);
  // The new period starts the day after the old one ends, or tomorrow when the old one has ended or expired.
  const start = o!.status !== "ended" && o!.end_date && o!.end_date >= manilaToday() ? o!.end_date : manilaToday();
  const days = o!.start_date && o!.end_date ? Math.round((Date.parse(o!.end_date) - Date.parse(o!.start_date)) / 86400000) : 365;
  const end = new Date(Date.parse(`${start}T00:00:00Z`) + Math.min(days, 3650) * 86400000).toISOString().slice(0, 10);
  const nextStart = new Date(Date.parse(`${start}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const copy = {
    partner_user_id: o!.partner_user_id, parent_id: o!.parent_id, partner_category: o!.partner_category, rights: o!.rights, category_key: o!.category_key, category_label: o!.category_label,
    offer_id: o!.offer_id, exclusivity: o!.exclusivity, channels: o!.channels, online_sales: o!.online_sales, online_note: o!.online_note, excluded_accounts: o!.excluded_accounts,
    start_date: nextStart, end_date: end > nextStart ? end : addMonths(nextStart, 12), target_period: o!.target_period, target_net_sales: o!.target_net_sales, target_members: o!.target_members,
    target_note: o!.target_note, review_every: o!.review_every, terms_note: o!.terms_note, created_by: ctx.user.id,
  };
  const { data: made, error } = await ctx.db.from("territorial_appointments").insert(copy).select("id").single();
  if (error || !made) redirect(dbError(a.id, error?.message));
  if ((areas ?? []).length) await ctx.db.from("territory_areas").insert((areas ?? []).map((x) => ({ appointment_id: made!.id, level: x.level, code: x.code })));
  await history(ctx, a.id, "renewal_started", "A renewal draft was started from this appointment.", true);
  await history(ctx, made!.id, "created", "Renewal draft copied from an earlier appointment. Check the dates, areas and targets before approving.", true);
  await ctx.audit("territory_renewal_started", "territorial_appointments", made!.id, { from: a.id });
  done(made!.id, "done=renewal");
}

/** A performance review against the targets. The partner sees the rating, the outcome and the note, not the team note. */
export async function addReview(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const back = (q: string): never => redirect(page(a.id, q, "#reviews"));
  if (!["active", "suspended", "ended"].includes(a.status)) back("error=status");
  const ps = String(fd.get("period_start") ?? ""); const pe = String(fd.get("period_end") ?? "");
  if (!isDate(ps) || !isDate(pe) || pe < ps) back("error=period");
  const sales = parseAmount(fd.get("actual_net_sales")); const members = parseWhole(fd.get("actual_members"));
  if (sales === undefined || members === undefined) back("error=number");
  const rating = pick(fd.get("rating"), RATINGS); const outcome = pick(fd.get("outcome"), OUTCOMES);
  if (!rating || !outcome) back("error=rating");
  const note = str(fd, "note", 2000);
  const { error } = await ctx.db.from("territory_reviews").insert({ appointment_id: a.id, reviewer_id: ctx.user.id, period_start: ps, period_end: pe, actual_net_sales: sales, actual_members: members, rating, outcome, note, internal_note: str(fd, "internal_note", 2000) });
  if (error) redirect(dbError(a.id, error.message, "#reviews"));
  if (a.review_every && a.status !== "ended") {
    await ctx.db.from("territorial_appointments").update({ next_review_date: addMonths(pe, REVIEW_EVERY[a.review_every as ReviewEvery].months) }).eq("id", a.id);
  }
  await history(ctx, a.id, "reviewed", `${RATINGS[rating as keyof typeof RATINGS]}; ${OUTCOMES[outcome as keyof typeof OUTCOMES]}.`);
  await ctx.audit("territory_reviewed", "territorial_appointments", a.id, { rating, outcome, period: [ps, pe] });
  await tellApplicant(a.partner_user_id, "Your territory performance review", `${a.category_label}: ${RATINGS[rating as keyof typeof RATINGS]}. ${OUTCOMES[outcome as keyof typeof OUTCOMES]}.`, "/partner-us/territories", "FLAME PH territory");
  done(a.id, "done=reviewed", "#reviews");
}

export async function teamNote(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const note = str(fd, "note", 2000);
  if (!note) redirect(page(a.id, "error=empty_note", "#history"));
  await history(ctx, a.id, "team_note", note, true);
  await ctx.audit("territory_team_note", "territorial_appointments", a.id);
  done(a.id, "done=note", "#history");
}

/** Changes the next review date of an approved appointment (the only thing besides the team note that may change). */
export async function setNextReview(fd: FormData) {
  const { ctx, a } = await load(uuid(fd.get("id")));
  const d = String(fd.get("next_review_date") ?? "");
  if (!isDate(d)) redirect(page(a.id, "error=date", "#reviews"));
  const { error } = await ctx.db.from("territorial_appointments").update({ next_review_date: d }).eq("id", a.id);
  if (error) redirect(dbError(a.id, error.message, "#reviews"));
  done(a.id, "done=next_review", "#reviews");
}

/** Sub-partner nominations: accept (then start a draft under the main appointment) or decline with a note. */
export async function decideNomination(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const id = uuid(fd.get("nomination_id"));
  const decision = String(fd.get("decision") ?? "");
  const back = (q: string): never => redirect(`${HOME}/nominations?${q}`);
  if (!id || !["accepted", "declined"].includes(decision)) back("error=failed");
  const { data: n } = await ctx.db.from("territory_nominations").select("id, nominator_id, parent_id, nominee_name, status").eq("id", id!).maybeSingle();
  if (!n || n.status !== "submitted") back("error=status");
  if (n!.nominator_id === ctx.user.id) back("error=own");
  const note = str(fd, "decision_note", 1000);
  if (decision === "declined" && !note) back("error=note");
  const { error } = await ctx.db.from("territory_nominations").update({ status: decision, decided_by: ctx.user.id, decision_note: note }).eq("id", id!).eq("status", "submitted");
  if (error) back("error=failed");
  await ctx.audit(`territory_nomination_${decision}`, "territory_nominations", id!, { parent: n!.parent_id });
  await tellApplicant(n!.nominator_id, decision === "accepted" ? "Your sub-partner nomination was accepted for review" : "Your sub-partner nomination was not accepted",
    decision === "accepted" ? `The national team will contact ${n!.nominee_name} and decide on an appointment. You do not need to do anything.` : `${n!.nominee_name}: ${note}`,
    "/partner-us/territories", "FLAME PH territory");
  revalidatePath(`${HOME}/nominations`); revalidatePath("/partner-us/territories");
  if (decision === "accepted") redirect(`${HOME}/new?parent=${n!.parent_id}&nomination=${n!.id}`);
  back("done=declined");
}
