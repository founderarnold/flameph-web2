"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OFFER_EDITABLE, OFFER_LAST_STEP, parseCount, VAT_BASIS } from "@/lib/offers";
import {
  FREE_TRIAL, hasBlanketGuarantee, MAX_PACKAGES, MAX_REFERENCES, parseMilestones, parseRate, RATE_BASIS, SERVICE_CATEGORIES, SERVICE_MODES,
} from "@/lib/service-offers";
import { ownOffer } from "./own";

// The service provider's own screens of a service Best Offer (Step 6): about the service, packages and rates, service
// standards, past clients, and the commission. Files, sending, withdrawing and reopening are shared with supplier
// offers (./actions). Every write goes through here with the server key, after checking that the signed-in member owns
// the offer and it is still a draft (or was sent back). The database checks the same rules again (0036).

const HOME = "/partner-us/offers";
const go = (path: string): never => redirect(path);
const formPath = (id: string, step: number, q = "") => `${HOME}/${id}?step=${step}${q ? `&${q}` : ""}`;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const yesNo = (v: unknown) => (v === "yes" ? true : v === "no" ? false : null);
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

async function ownService(fd: FormData, step: number) {
  const ctx = await ownOffer(uuid(fd.get("id")));
  if (ctx.offer.kind !== "service") go(formPath(ctx.offer.id, step));
  if (!OFFER_EDITABLE.includes(ctx.offer.status)) go(formPath(ctx.offer.id, step, "error=locked"));
  return ctx;
}

/** Saves screen 1, 3 or 5. "Save draft" stays; "Save and continue" goes on. Formats are checked; blanks are fine until sending. */
export async function saveServiceStep(fd: FormData) {
  const step = Math.min(OFFER_LAST_STEP, Math.max(1, Number(fd.get("step")) || 1));
  const { offer, admin, user } = await ownService(fd, step);
  const next = fd.get("intent") === "next";
  const bad = (code: string): never => go(formPath(offer.id, step, `error=${code}`));
  const date = (k: string) => {
    const d = String(fd.get(k) ?? "").trim();
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today())) bad(k === "license_valid_until" ? "license_date" : "date");
    return d || null;
  };
  const patch: Record<string, unknown> = {};

  if (step === 1) {
    patch.title = str(fd, "title", 150);
    patch.service_category = pick(fd.get("service_category"), SERVICE_CATEGORIES);
    patch.profession = str(fd, "profession", 150);
    patch.qualifications = str(fd, "qualifications", 1500);
    patch.license_required = yesNo(fd.get("license_required"));
    patch.license_body = patch.license_required ? str(fd, "license_body", 120) : null;
    patch.license_no = patch.license_required ? str(fd, "license_no", 60) : null;
    patch.license_valid_until = patch.license_required ? date("license_valid_until") : null;
    patch.valid_until = date("valid_until");
    patch.vat_basis = pick(fd.get("vat_basis"), VAT_BASIS);
    patch.service_mode = pick(fd.get("service_mode"), SERVICE_MODES);
    patch.serviceable_areas = str(fd, "serviceable_areas", 1000);
    if (hasBlanketGuarantee(patch.title as string, patch.qualifications as string)) bad("guarantee");
  } else if (step === 3) {
    patch.free_trial = pick(fd.get("free_trial"), FREE_TRIAL);
    patch.trial_terms = str(fd, "trial_terms", 500);
    patch.availability = str(fd, "availability", 500);
    const clients = parseCount(fd.get("monthly_clients"), 100000);
    const start = parseCount(fd.get("lead_time_days"), 365);
    const hours = parseCount(fd.get("response_hours"), 720);
    if (Number.isNaN(clients) || Number.isNaN(start) || clients === 0) bad("qty");
    if (Number.isNaN(hours) || hours === 0) bad("hours");
    patch.monthly_clients = clients;
    patch.lead_time_days = start;
    patch.response_hours = hours;
    patch.service_levels = str(fd, "service_levels", 1000);
    patch.correction_policy = str(fd, "correction_policy", 1000);
    patch.refund_policy = str(fd, "refund_policy", 1000);
    patch.confidentiality = str(fd, "confidentiality", 1000);
    patch.handles_personal_data = yesNo(fd.get("handles_personal_data"));
    if (hasBlanketGuarantee(patch.trial_terms as string, patch.availability as string, patch.service_levels as string,
      patch.correction_policy as string, patch.refund_policy as string, patch.confidentiality as string)) bad("guarantee");
  } else if (step === 4) {
    patch.portfolio = str(fd, "portfolio", 1500);
    if (hasBlanketGuarantee(patch.portfolio as string)) bad("guarantee");
  } else if (step === 5) {
    const raw = String(fd.get("commission_pct") ?? "").replace("%", "").trim();
    if (raw && !/^\d{1,2}(\.\d{1,2})?$/.test(raw)) bad("commission");
    const pct = raw ? Number(raw) : null;
    if (pct !== null && pct > 50) bad("commission");
    patch.commission_pct = pct;
    patch.commission_note = str(fd, "commission_note", 500);
    if (hasBlanketGuarantee(patch.commission_note as string)) bad("guarantee");
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("supplier_offers").update(patch).eq("id", offer.id).eq("user_id", user.id).eq("kind", "service");
    if (error) bad("failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(next ? formPath(offer.id, Math.min(OFFER_LAST_STEP, step + 1)) : formPath(offer.id, step, "done=saved"));
}

/** Adds or changes one service package: scope, exclusions, rates, milestones and measurable acceptance criteria. */
export async function savePackage(fd: FormData) {
  const { offer, admin } = await ownService(fd, 2);
  const pkgId = uuid(fd.get("package_id"));
  const back = (q: string): never => go(formPath(offer.id, 2, `${q}${pkgId ? `&pkg=${pkgId}` : "&pkg=new"}`));

  const name = str(fd, "name", 150);
  const scope = str(fd, "scope", 2000);
  const acceptance_criteria = str(fd, "acceptance_criteria", 1500);
  if (!name || !scope || scope.length < 10 || !acceptance_criteria || acceptance_criteria.length < 10) back("error=package");
  const rate_basis = pick(fd.get("rate_basis"), RATE_BASIS);
  const unit_label = str(fd, "unit_label", 60);
  if (!rate_basis) back("error=rate");
  if (rate_basis === "unit" && !unit_label) back("error=unit");
  const normal_rate = parseRate(fd.get("normal_rate"));
  const member_rate = parseRate(fd.get("member_rate"));
  if ([normal_rate, member_rate].some((n) => Number.isNaN(n)) || !member_rate || member_rate <= 0) back("error=rate");
  if (normal_rate !== null && member_rate! > normal_rate) back("error=rate");
  const min_units = parseCount(fd.get("min_units"), 100000);
  const duration = parseCount(fd.get("duration_days"), 730);
  const revisions = parseCount(fd.get("revisions_included"), 20);
  if ([min_units, duration, revisions].some((n) => Number.isNaN(n)) || min_units === 0) back("error=qty");
  const milestones = parseMilestones(Array.from({ length: 6 }, (_, i) => ({ title: fd.get(`ms_title_${i}`), days: fd.get(`ms_days_${i}`) })));
  if (milestones === "bad") back("error=milestones");
  const description = str(fd, "description", 1000);
  const exclusions = str(fd, "exclusions", 1000);
  if (hasBlanketGuarantee(name, description, scope, exclusions, acceptance_criteria, ...(milestones as { title: string }[]).map((m) => m.title))) back("error=guarantee");

  const row = {
    name, description, scope, exclusions, rate_basis, unit_label: rate_basis === "unit" ? unit_label : null, normal_rate, member_rate,
    min_units: min_units ?? 1, duration_days: duration, milestones, acceptance_criteria, revisions_included: revisions ?? 0,
  };
  if (pkgId) {
    const { error } = await admin.from("service_offer_packages").update(row).eq("id", pkgId).eq("offer_id", offer.id);
    if (error) back("error=failed");
  } else {
    const { data: rows } = await admin.from("service_offer_packages").select("position").eq("offer_id", offer.id).order("position", { ascending: false }).limit(MAX_PACKAGES);
    if ((rows?.length ?? 0) >= MAX_PACKAGES) back("error=package_limit");
    const { error } = await admin.from("service_offer_packages").insert({ ...row, offer_id: offer.id, position: Math.min(100, (rows?.[0]?.position ?? 0) + 1) });
    if (error) back("error=failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=package_saved"));
}

export async function deletePackage(fd: FormData) {
  const { offer, admin } = await ownService(fd, 2);
  const pkgId = uuid(fd.get("package_id"));
  if (!pkgId) go(formPath(offer.id, 2, "error=failed"));
  const { error } = await admin.from("service_offer_packages").delete().eq("id", pkgId!).eq("offer_id", offer.id);
  if (error) go(formPath(offer.id, 2, "error=failed"));
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=package_deleted"));
}

/** Adds or changes one past client the national team may call. A changed reference must be checked again. */
export async function saveReference(fd: FormData) {
  const { offer, admin } = await ownService(fd, 4);
  const refId = uuid(fd.get("reference_id"));
  const back = (q: string): never => go(formPath(offer.id, 4, `${q}${refId ? `&ref=${refId}` : "&ref=new"}`));
  const client_name = str(fd, "client_name", 150);
  const client_contact = str(fd, "client_contact", 150);
  const work_done = str(fd, "work_done", 500);
  if (!client_name || client_name.length < 2 || !client_contact || client_contact.length < 5 || !work_done || work_done.length < 5 || fd.get("client_consent") !== "yes") back("error=reference");
  const d = String(fd.get("completed_on") ?? "").trim();
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today())) back("error=date");
  const row = { client_name, client_contact, work_done, completed_on: d || null, client_consent: true };
  if (refId) {
    const { error } = await admin.from("service_offer_references").update(row).eq("id", refId).eq("offer_id", offer.id);
    if (error) back("error=failed");
  } else {
    const { data: rows } = await admin.from("service_offer_references").select("position").eq("offer_id", offer.id).order("position", { ascending: false }).limit(MAX_REFERENCES);
    if ((rows?.length ?? 0) >= MAX_REFERENCES) back("error=reference_limit");
    const { error } = await admin.from("service_offer_references").insert({ ...row, offer_id: offer.id, position: Math.min(100, (rows?.[0]?.position ?? 0) + 1) });
    if (error) back("error=failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 4, "done=reference_saved"));
}

export async function deleteReference(fd: FormData) {
  const { offer, admin } = await ownService(fd, 4);
  const refId = uuid(fd.get("reference_id"));
  if (!refId) go(formPath(offer.id, 4, "error=failed"));
  const { error } = await admin.from("service_offer_references").delete().eq("id", refId!).eq("offer_id", offer.id);
  if (error) go(formPath(offer.id, 4, "error=failed"));
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 4, "done=reference_deleted"));
}
