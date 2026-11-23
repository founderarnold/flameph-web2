"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { tellApplicant } from "@/lib/partner-server";
import { place } from "@/lib/ph-geo";
import {
  CATEGORIES, dbReason, isDay, manilaDay, MAX_TOTAL_PCT, MAX_WITHHOLDING_PCT, parseMoney, parsePct, SALE_CHANNELS, totalPct, type Category,
} from "@/lib/commission";

// Admin > Partners > Commissions. A RECORD ONLY: flameph.org never collects, holds or pays money.
// - Rates: only the national team (founder, admins, national reviewers) writes them, and a SECOND person approves.
// - Ledger and payouts: only finance (finance role, or the founder) records, and a SECOND finance person approves.
// The database (0034) checks every one of these rules again, whoever writes.

const NATIONAL = ["super_admin", "admin", "national_reviewer"] as const;
const FINANCE = ["super_admin", "finance"] as const;
const HOME = "/admin/partners/commissions";
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const withDb = (path: string, message: string | undefined, hash = "") => {
  const r = dbReason(message);
  return `${path}${path.includes("?") ? "&" : "?"}${r ? `error=db&m=${encodeURIComponent(r)}` : "error=failed"}${hash}`;
};
const refresh = (...paths: string[]) => { for (const p of [HOME, `${HOME}/rules`, `${HOME}/payouts`, `${HOME}/reconcile`, "/partner-us/commissions", ...paths]) revalidatePath(p); };

// ==================================================================================================================
// Rates
// ==================================================================================================================
function readRate(fd: FormData) {
  const s = {
    national_pct: parsePct(fd.get("national_pct")), regional_pct: parsePct(fd.get("regional_pct")),
    provincial_pct: parsePct(fd.get("provincial_pct")), city_pct: parsePct(fd.get("city_pct")),
  };
  if (Object.values(s).some((v) => v === undefined)) return { error: "pct" as const };
  const split = s as { national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number };
  const t = totalPct(split);
  if (t <= 0 || t > MAX_TOTAL_PCT) return { error: "total" as const };
  return { split };
}

/** A new draft rate: a new version of a category default, or a negotiated rate from a signed agreement with one partner. */
export async function createRule(fd: FormData) {
  const ctx = await adminContext([...NATIONAL]);
  const back = (q: string): never => redirect(`${HOME}/rules?${q}#new`);
  const scope = fd.get("scope") === "agreement" ? "agreement" : "default";
  const category = pick(fd.get("partner_category"), CATEGORIES) as Category | null;
  if (!category) back("error=category");
  const rate = readRate(fd);
  if (rate.error) back(`error=${rate.error}`);
  const from = String(fd.get("effective_from") ?? "");
  if (!isDay(from)) back("error=date");
  const row: Record<string, unknown> = { scope, partner_category: category, ...rate.split, effective_from: from, basis_note: text(fd, "basis_note", 1000), internal_note: text(fd, "internal_note", 2000), created_by: ctx.user.id };
  if (scope === "agreement") {
    const partner = uuid(fd.get("partner"));
    const contract = str(fd, "contract_ref", 120);
    const signed = String(fd.get("signed_on") ?? "");
    const to = String(fd.get("effective_to") ?? "").trim();
    if (!partner) back("error=partner");
    if (partner === ctx.user.id) back("error=own");
    if (!contract || contract.length < 2) back("error=contract");
    if (!isDay(signed) || signed > manilaDay()) back("error=signed");
    if (to && (!isDay(to) || to < from)) back("error=date_order");
    Object.assign(row, { partner_user_id: partner, contract_ref: contract, signed_on: signed, effective_to: to || null, appointment_id: uuid(fd.get("appointment_id")), offer_id: uuid(fd.get("offer_id")) });
  }
  const { data, error } = await ctx.db.from("commission_rules").insert(row).select("id").single();
  if (error || !data) redirect(withDb(`${HOME}/rules`, error?.message, "#new"));
  await ctx.audit("commission_rule_created", "commission_rules", data!.id, { scope, category, ...rate.split });
  refresh();
  redirect(`${HOME}/rules/${data!.id}?done=created`);
}

async function loadRule(id: string | null) {
  const ctx = await adminContext([...NATIONAL]);
  if (!id) redirect(`${HOME}/rules`);
  const { data } = await ctx.db.from("commission_rules").select("id, scope, status, partner_user_id, partner_category, partner_name, created_by, effective_from, effective_to").eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}/rules?error=missing`);
  return { ctx, r: data! };
}

/** Draft only: the rate, dates, contract details and notes. */
export async function saveRule(fd: FormData) {
  const { ctx, r } = await loadRule(uuid(fd.get("id")));
  const page = `${HOME}/rules/${r.id}`;
  const back = (q: string): never => redirect(`${page}?${q}#edit`);
  if (r.status !== "draft") back("error=locked");
  const rate = readRate(fd);
  if (rate.error) back(`error=${rate.error}`);
  const from = String(fd.get("effective_from") ?? "");
  if (!isDay(from)) back("error=date");
  const patch: Record<string, unknown> = { ...rate.split, effective_from: from, basis_note: text(fd, "basis_note", 1000), internal_note: text(fd, "internal_note", 2000) };
  if (r.scope === "agreement") {
    const contract = str(fd, "contract_ref", 120);
    const signed = String(fd.get("signed_on") ?? "");
    const to = String(fd.get("effective_to") ?? "").trim();
    if (!contract || contract.length < 2) back("error=contract");
    if (!isDay(signed) || signed > manilaDay()) back("error=signed");
    if (to && (!isDay(to) || to < from)) back("error=date_order");
    Object.assign(patch, { contract_ref: contract, signed_on: signed, effective_to: to || null, appointment_id: uuid(fd.get("appointment_id")) });
  }
  const { error } = await ctx.db.from("commission_rules").update(patch).eq("id", r.id).eq("status", "draft");
  if (error) redirect(withDb(page, error.message, "#edit"));
  refresh(page);
  redirect(`${page}?done=saved#edit`);
}

/** A second person approves; they declare no conflict of interest. A new default replaces the old one from its date. */
export async function approveRule(fd: FormData) {
  const { ctx, r } = await loadRule(uuid(fd.get("id")));
  const page = `${HOME}/rules/${r.id}`;
  const back = (q: string): never => redirect(`${page}?${q}#approve`);
  if (r.status !== "draft") back("error=status");
  if (r.created_by === ctx.user.id) back("error=second");
  if (r.partner_user_id && r.partner_user_id === ctx.user.id) back("error=own");
  if (fd.get("no_conflict") !== "yes") back("error=coi");
  const { error } = await ctx.db.from("commission_rules").update({ status: "active", approved_by: ctx.user.id, approver_declared_at: new Date().toISOString() }).eq("id", r.id).eq("status", "draft");
  if (error) redirect(withDb(page, error.message, "#approve"));
  await ctx.audit("commission_rule_approved", "commission_rules", r.id, { scope: r.scope, category: r.partner_category });
  if (r.scope === "agreement" && r.partner_user_id) {
    await tellApplicant(r.partner_user_id, "Your agreed commission rate was recorded", "The FLAME PH national team recorded the commission rate from your signed agreement. Open My commissions to see it. It is a record only; money is handled by MarketplacePH Online Store.", "/partner-us/commissions", "FLAME PH commissions");
  }
  refresh(page);
  redirect(`${page}?done=approved`);
}

/** Cancel a draft, or retire an agreement rate from a last day (a default is only ever replaced by a newer default). */
export async function endRule(fd: FormData) {
  const { ctx, r } = await loadRule(uuid(fd.get("id")));
  const page = `${HOME}/rules/${r.id}`;
  const back = (q: string): never => redirect(`${page}?${q}#end`);
  const reason = str(fd, "reason", 1000);
  if (!reason) back("error=reason");
  if (r.status === "draft") {
    const { error } = await ctx.db.from("commission_rules").update({ status: "cancelled", retired_by: ctx.user.id, status_reason: reason }).eq("id", r.id).eq("status", "draft");
    if (error) redirect(withDb(page, error.message, "#end"));
    await ctx.audit("commission_rule_cancelled", "commission_rules", r.id, { reason });
    refresh(page);
    redirect(`${page}?done=cancelled`);
  }
  if (r.status !== "active" || r.scope !== "agreement") back("error=status");
  const last = String(fd.get("last_day") ?? "");
  if (!isDay(last) || last < r.effective_from || (r.effective_to && last > r.effective_to)) back("error=last_day");
  const { error } = await ctx.db.from("commission_rules").update({ status: "retired", retired_by: ctx.user.id, status_reason: reason, effective_to: last }).eq("id", r.id).eq("status", "active");
  if (error) redirect(withDb(page, error.message, "#end"));
  await ctx.audit("commission_rule_retired", "commission_rules", r.id, { reason, last });
  if (r.partner_user_id) await tellApplicant(r.partner_user_id, "Your agreed commission rate ended", `The agreed commission rate ends on ${last}. Reason: ${reason}`, "/partner-us/commissions", "FLAME PH commissions");
  refresh(page);
  redirect(`${page}?done=retired`);
}

// ==================================================================================================================
// Ledger: qualified sales and refunds
// ==================================================================================================================
function readEntry(fd: FormData, kind: "sale" | "refund") {
  const reference = str(fd, "reference", 120);
  const date = String(fd.get("sale_date") ?? "");
  const collected = String(fd.get("collected_on") ?? "").trim();
  const gross = parseMoney(fd.get("gross_amount"));
  const deductions = kind === "sale" ? parseMoney(fd.get("deductions")) : 0;
  const today = manilaDay();
  if (!reference || reference.length < 2) return { error: "reference" };
  if (!isDay(date) || date > today) return { error: "date" };
  if (collected && (!isDay(collected) || collected > today)) return { error: "collected" };
  if (gross === undefined || gross === null || gross <= 0 || deductions === undefined) return { error: "amount" };
  if (kind === "sale" && (deductions ?? 0) > gross) return { error: "deductions" };
  const row: Record<string, unknown> = { reference, sale_date: date, collected_on: collected || null, gross_amount: gross, description: text(fd, "description", 500), internal_note: text(fd, "internal_note", 2000) };
  if (kind === "sale") {
    const city = String(fd.get("city_code") ?? "");
    if (!place(city)) return { error: "place" };
    Object.assign(row, { deductions: deductions ?? 0, city_code: city, buyer_name: str(fd, "buyer_name", 200), channel: pick(fd.get("channel"), SALE_CHANNELS), appointment_id: uuid(fd.get("appointment_id")) });
  }
  return { row };
}

/** Finance records a qualified sale (from MarketplacePH Online Store's report) or a refund against an approved sale. */
export async function recordEntry(fd: FormData) {
  const ctx = await adminContext([...FINANCE]);
  const kind = fd.get("kind") === "refund" ? "refund" : "sale";
  const original = uuid(fd.get("original_id"));
  const back = (q: string): never => redirect(`${HOME}/new?${kind === "refund" && original ? `refund=${original}&` : ""}${q}`);
  const read = readEntry(fd, kind);
  if (read.error) back(`error=${read.error}`);
  let row: Record<string, unknown> = { ...read.row, kind, recorded_by: ctx.user.id };
  if (kind === "refund") {
    if (!original) back("error=original");
    const { data: o } = await ctx.db.from("commission_entries").select("id, status, kind, partner_name, partner_category, city_code").eq("id", original!).maybeSingle();
    if (!o || o.status !== "approved" || o.kind !== "sale") back("error=original");
    // The database copies the partner, place, channel and territory from the sale.
    row = { ...row, original_id: original, partner_name: o!.partner_name, partner_category: o!.partner_category, city_code: o!.city_code };
  } else {
    const partner = uuid(fd.get("partner"));
    const category = pick(fd.get("partner_category"), CATEGORIES);
    if (!partner || !category) back("error=partner");
    if (partner === ctx.user.id) back("error=own");
    row = { ...row, partner_user_id: partner, partner_category: category, partner_name: "(filled in by the database)" };
  }
  const { data, error } = await ctx.db.from("commission_entries").insert(row).select("id").single();
  if (error?.code === "23505") back("error=duplicate");
  if (error || !data) redirect(withDb(`${HOME}/new${kind === "refund" && original ? `?refund=${original}` : ""}`, error?.message));
  await ctx.audit(kind === "refund" ? "commission_refund_recorded" : "commission_sale_recorded", "commission_entries", data!.id, { reference: row.reference, gross: row.gross_amount });
  refresh();
  redirect(`${HOME}/${data!.id}?done=recorded`);
}

async function loadEntry(id: string | null) {
  const ctx = await adminContext([...FINANCE]);
  if (!id) redirect(HOME);
  const { data } = await ctx.db.from("commission_entries").select("id, kind, status, partner_user_id, recorded_by, reference").eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}?error=missing`);
  return { ctx, e: data! };
}

/** While still recorded: fix the facts (amounts, dates, place, channel, territory, buyer). */
export async function saveEntry(fd: FormData) {
  const { ctx, e } = await loadEntry(uuid(fd.get("id")));
  const page = `${HOME}/${e.id}`;
  if (e.status !== "recorded") redirect(`${page}?error=locked`);
  const read = readEntry(fd, e.kind as "sale" | "refund");
  if (read.error) redirect(`${page}?error=${read.error}#edit`);
  const { error } = await ctx.db.from("commission_entries").update(read.row!).eq("id", e.id).eq("status", "recorded");
  if (error?.code === "23505") redirect(`${page}?error=duplicate#edit`);
  if (error) redirect(withDb(page, error.message, "#edit"));
  await ctx.audit("commission_entry_saved", "commission_entries", e.id, null);
  refresh(page);
  redirect(`${page}?done=saved#edit`);
}

/** A second finance person approves. The database picks the rate for the date, checks the attribution and writes the lines. */
export async function approveEntry(fd: FormData) {
  const { ctx, e } = await loadEntry(uuid(fd.get("id")));
  const page = `${HOME}/${e.id}`;
  const back = (q: string): never => redirect(`${page}?${q}#decide`);
  if (e.status !== "recorded") back("error=status");
  if (e.recorded_by === ctx.user.id) back("error=second");
  if (e.partner_user_id && e.partner_user_id === ctx.user.id) back("error=own");
  if (fd.get("checked") !== "yes") back("error=checked");
  const { error } = await ctx.db.from("commission_entries").update({ status: "approved", approved_by: ctx.user.id }).eq("id", e.id).eq("status", "recorded");
  if (error) redirect(withDb(page, error.message, "#decide"));
  await ctx.audit("commission_entry_approved", "commission_entries", e.id, { reference: e.reference });
  refresh(page);
  redirect(`${page}?done=approved`);
}

/** Not eligible (a real sale that does not count) or void (recorded by mistake). Reason required. */
export async function decideEntry(fd: FormData) {
  const { ctx, e } = await loadEntry(uuid(fd.get("id")));
  const page = `${HOME}/${e.id}`;
  const to = fd.get("to") === "void" ? "void" : "not_eligible";
  const reason = str(fd, "reason", 1000);
  if (e.status !== "recorded") redirect(`${page}?error=status#decide`);
  if (!reason) redirect(`${page}?error=reason#decide`);
  const { error } = await ctx.db.from("commission_entries").update({ status: to, decided_by: ctx.user.id, status_reason: reason }).eq("id", e.id).eq("status", "recorded");
  if (error) redirect(withDb(page, error.message, "#decide"));
  await ctx.audit(`commission_entry_${to}`, "commission_entries", e.id, { reason });
  refresh(page);
  redirect(`${page}?done=${to}`);
}

/** The team-only note can be updated at any time (it never changes a figure). */
export async function noteEntry(fd: FormData) {
  const { ctx, e } = await loadEntry(uuid(fd.get("id")));
  const page = `${HOME}/${e.id}`;
  const { error } = await ctx.db.from("commission_entries").update({ internal_note: text(fd, "internal_note", 2000) }).eq("id", e.id);
  if (error) redirect(withDb(page, error.message, "#note"));
  refresh(page);
  redirect(`${page}?done=note#note`);
}

// ==================================================================================================================
// Payouts
// ==================================================================================================================
/** Finance prepares a payout for one place: every approved line not yet paid, up to the period end. */
export async function preparePayout(fd: FormData) {
  const ctx = await adminContext([...FINANCE]);
  const back = (q: string): never => redirect(`${HOME}/payouts?${q}`);
  const key = String(fd.get("recipient_key") ?? "");
  const end = String(fd.get("period_end") ?? "");
  const wh = parsePct(fd.get("withholding_pct"), MAX_WITHHOLDING_PCT);
  if (!/^(national|(region|province|city):[0-9]{10})$/.test(key)) back("error=recipient");
  if (!isDay(end) || end > manilaDay()) back("error=period");
  if (wh === undefined) back("error=withholding");
  const { data: last } = await ctx.db.from("commission_lines").select("recipient_label, chapter_id").eq("recipient_key", key).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) back("error=nothing");
  let label = last!.recipient_label as string;
  if (last!.chapter_id) {
    const { data: ch } = await ctx.db.from("chapters").select("name").eq("id", last!.chapter_id).maybeSingle();
    if (ch?.name) label = `${ch.name} (${label})`.slice(0, 200);
  }
  const { data, error } = await ctx.db.from("commission_payouts").insert({ recipient_key: key, recipient_label: label, chapter_id: last!.chapter_id ?? null, period_end: end, withholding_pct: wh, note: text(fd, "note", 1000), prepared_by: ctx.user.id }).select("id").single();
  if (error || !data) redirect(withDb(`${HOME}/payouts`, error?.message));
  await ctx.audit("commission_payout_prepared", "commission_payouts", data!.id, { key, end, withholding: wh });
  refresh();
  redirect(`${HOME}/payouts/${data!.id}?done=prepared`);
}

async function loadPayout(id: string | null) {
  const ctx = await adminContext([...FINANCE]);
  if (!id) redirect(`${HOME}/payouts`);
  const { data } = await ctx.db.from("commission_payouts").select("id, status, prepared_by, total_amount").eq("id", id!).maybeSingle();
  if (!data) redirect(`${HOME}/payouts?error=missing`);
  return { ctx, p: data! };
}

/** Draft only: withholding rate and note. */
export async function savePayout(fd: FormData) {
  const { ctx, p } = await loadPayout(uuid(fd.get("id")));
  const page = `${HOME}/payouts/${p.id}`;
  const wh = parsePct(fd.get("withholding_pct"), MAX_WITHHOLDING_PCT);
  if (p.status !== "draft") redirect(`${page}?error=locked`);
  if (wh === undefined) redirect(`${page}?error=withholding#edit`);
  const { error } = await ctx.db.from("commission_payouts").update({ withholding_pct: wh, note: text(fd, "note", 1000) }).eq("id", p.id).eq("status", "draft");
  if (error) redirect(withDb(page, error.message, "#edit"));
  refresh(page);
  redirect(`${page}?done=saved#edit`);
}

/** approve (a second finance person), paid (with MarketplacePH Online Store's payment reference and date), cancel. */
export async function movePayout(fd: FormData) {
  const { ctx, p } = await loadPayout(uuid(fd.get("id")));
  const page = `${HOME}/payouts/${p.id}`;
  const move = String(fd.get("move") ?? "");
  const back = (q: string): never => redirect(`${page}?${q}#decide`);
  let patch: Record<string, unknown>;
  if (move === "approve") {
    if (p.status !== "draft") back("error=status");
    if (p.prepared_by === ctx.user.id) back("error=second");
    if (Number(p.total_amount) <= 0) back("error=negative");
    if (fd.get("checked") !== "yes") back("error=checked");
    patch = { status: "approved", approved_by: ctx.user.id };
  } else if (move === "paid") {
    const on = String(fd.get("paid_on") ?? "");
    const ref = str(fd, "mph_reference", 120);
    if (p.status !== "approved") back("error=status");
    if (!isDay(on) || on > manilaDay()) back("error=paid_on");
    if (!ref || ref.length < 2) back("error=mph_reference");
    patch = { status: "paid", paid_recorded_by: ctx.user.id, paid_on: on, mph_reference: ref };
  } else if (move === "cancel") {
    const reason = str(fd, "reason", 1000);
    if (!["draft", "approved"].includes(p.status)) back("error=status");
    if (!reason) back("error=reason");
    patch = { status: "cancelled", cancelled_by: ctx.user.id, status_reason: reason };
  } else back("error=failed");
  const { error } = await ctx.db.from("commission_payouts").update(patch!).eq("id", p.id).eq("status", p.status);
  if (error) redirect(withDb(page, error.message, "#decide"));
  await ctx.audit(`commission_payout_${move}`, "commission_payouts", p.id, patch!);
  refresh(page);
  redirect(`${page}?done=${move}`);
}
