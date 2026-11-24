"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OFFER_EDITABLE, OFFER_LAST_STEP, parseCount, parseMoney, SAMPLES, VAT_BASIS } from "@/lib/offers";
import { place } from "@/lib/ph-geo";
import {
  CPR_HOLDER, CPR_STATUS, FORMULA_OWNERSHIP, IP_TERMS_VERSION, MAX_SIG_PRODUCTS, MAX_SITES, PACKAGING_SUPPLY, PRICE_INCLUDES, PRODUCT_TYPES, SIGNATURE_CATEGORIES,
} from "@/lib/signature";
import { ownOffer } from "./own";

// The toll manufacturer's own screens of a FLAME Signature proposal (Step 7): about the proposal, manufacturing sites,
// products, quality and recall, and the licence terms with the commission. Files, sending, withdrawing and reopening are
// shared with the other offers (./actions). Every write goes through here with the server key, after checking that the
// signed-in member owns the proposal and it is still a draft (or was sent back). The database checks the same rules
// again (0037).

const HOME = "/partner-us/offers";
const go = (path: string): never => redirect(path);
const formPath = (id: string, step: number, q = "") => `${HOME}/${id}?step=${step}${q ? `&${q}` : ""}`;
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const str = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const pick = <T extends object>(v: unknown, list: T) => (typeof v === "string" && v in list ? v : null);
const yesNo = (v: unknown) => (v === "yes" ? true : v === "no" ? false : null);
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

async function ownSignature(fd: FormData, step: number) {
  const ctx = await ownOffer(uuid(fd.get("id")));
  if (ctx.offer.kind !== "manufacturer") go(formPath(ctx.offer.id, step));
  if (!OFFER_EDITABLE.includes(ctx.offer.status)) go(formPath(ctx.offer.id, step, "error=locked"));
  return ctx;
}

/** Saves screen 1, 4 or 5. "Save draft" stays; "Save and continue" goes on. Formats are checked; blanks are fine until sending. */
export async function saveSignatureStep(fd: FormData) {
  const step = Math.min(OFFER_LAST_STEP, Math.max(1, Number(fd.get("step")) || 1));
  const { offer, admin, user } = await ownSignature(fd, step);
  const next = fd.get("intent") === "next";
  const bad = (code: string): never => go(formPath(offer.id, step, `error=${code}`));
  const patch: Record<string, unknown> = {};

  if (step === 1) {
    patch.title = str(fd, "title", 150);
    patch.signature_category = pick(fd.get("signature_category"), SIGNATURE_CATEGORIES);
    patch.formulation_ownership = pick(fd.get("formulation_ownership"), FORMULA_OWNERSHIP);
    patch.formulation_note = str(fd, "formulation_note", 1000);
    patch.rnd_support = yesNo(fd.get("rnd_support"));
    const d = String(fd.get("valid_until") ?? "").trim();
    if (d && (!isDate(d) || d < today())) bad("date");
    patch.valid_until = d || null;
    patch.vat_basis = pick(fd.get("vat_basis"), VAT_BASIS);
    patch.serviceable_areas = str(fd, "serviceable_areas", 1000);
    const lt = parseCount(fd.get("lead_time_days"), 365);
    if (Number.isNaN(lt)) bad("qty");
    patch.lead_time_days = lt;
    patch.packaging_supply = pick(fd.get("packaging_supply"), PACKAGING_SUPPLY);
  } else if (step === 4) {
    patch.sample_availability = pick(fd.get("sample_availability"), SAMPLES);
    patch.sample_terms = str(fd, "sample_terms", 500);
    patch.qc_testing = str(fd, "qc_testing", 1500);
    patch.lab_partner = str(fd, "lab_partner", 200);
    patch.certifications = str(fd, "certifications", 500);
    patch.traceability = str(fd, "traceability", 1000);
    const years = parseCount(fd.get("batch_record_years"), 20);
    if (Number.isNaN(years) || years === 0) bad("qty");
    patch.batch_record_years = years;
    patch.recall_plan = str(fd, "recall_plan", 1500);
    patch.recall_contact = str(fd, "recall_contact", 200);
    const m = String(fd.get("mock_recall_on") ?? "").trim();
    if (m && (!isDate(m) || m > today())) bad("date");
    patch.mock_recall_on = m || null;
  } else if (step === 5) {
    const raw = String(fd.get("commission_pct") ?? "").replace("%", "").trim();
    if (raw && !/^\d{1,2}(\.\d{1,2})?$/.test(raw)) bad("commission");
    const pct = raw ? Number(raw) : null;
    if (pct !== null && pct > 50) bad("commission");
    patch.commission_pct = pct;
    patch.commission_note = str(fd, "commission_note", 500);
    if (fd.get("ip_terms") === "yes") { patch.ip_terms_version = IP_TERMS_VERSION; patch.ip_terms_accepted_at = new Date().toISOString(); }
    else if (fd.get("ip_terms_shown") === "yes") { patch.ip_terms_version = null; patch.ip_terms_accepted_at = null; }
  }
  if (Object.keys(patch).length) {
    const { error } = await admin.from("supplier_offers").update(patch).eq("id", offer.id).eq("user_id", user.id).eq("kind", "manufacturer");
    if (error) bad("failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(next ? formPath(offer.id, Math.min(OFFER_LAST_STEP, step + 1)) : formPath(offer.id, step, "done=saved"));
}

/** Adds or changes one manufacturing site: address with its PSGC city code, FDA License to Operate, capacity. */
export async function saveSite(fd: FormData) {
  const { offer, admin } = await ownSignature(fd, 2);
  const siteId = uuid(fd.get("site_id"));
  const back = (q: string): never => go(formPath(offer.id, 2, `${q}${siteId ? `&site=${siteId}` : "&site=new"}`));
  const site_name = str(fd, "site_name", 150);
  const address = str(fd, "address", 300);
  const monthly_capacity = str(fd, "monthly_capacity", 200);
  const site_type = fd.get("site_type") === "contract" ? "contract" : "own";
  const operator_name = site_type === "contract" ? str(fd, "operator_name", 150) : null;
  if (!site_name || site_name.length < 2 || !address || address.length < 5 || !monthly_capacity || monthly_capacity.length < 2 || (site_type === "contract" && !operator_name)) back("error=site");
  const city_code = String(fd.get("city_code") ?? "");
  if (!place(city_code)) back("error=city");
  const lto_no = str(fd, "lto_no", 60);
  const ltoDate = String(fd.get("lto_valid_until") ?? "").trim();
  if (!!lto_no !== !!ltoDate || (ltoDate && !isDate(ltoDate))) back("error=lto");
  const row = {
    site_name, site_type, operator_name, address, city_code, lto_no, lto_valid_until: ltoDate || null,
    certifications: str(fd, "certifications", 300), monthly_capacity, production_lines: str(fd, "production_lines", 500),
  };
  if (siteId) {
    const { error } = await admin.from("signature_sites").update(row).eq("id", siteId).eq("offer_id", offer.id);
    if (error) back("error=failed");
  } else {
    const { data: rows } = await admin.from("signature_sites").select("position").eq("offer_id", offer.id).order("position", { ascending: false }).limit(MAX_SITES);
    if ((rows?.length ?? 0) >= MAX_SITES) back("error=site_limit");
    const { error } = await admin.from("signature_sites").insert({ ...row, offer_id: offer.id, position: Math.min(100, (rows?.[0]?.position ?? 0) + 1) });
    if (error) back("error=failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=site_saved"));
}

export async function deleteSite(fd: FormData) {
  const { offer, admin } = await ownSignature(fd, 2);
  const siteId = uuid(fd.get("site_id"));
  if (!siteId) go(formPath(offer.id, 2, "error=failed"));
  const { error } = await admin.from("signature_sites").delete().eq("id", siteId!).eq("offer_id", offer.id);
  if (error) go(formPath(offer.id, 2, "error=failed"));
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 2, "done=site_deleted"));
}

/** Adds or changes one product (SKU): FDA registration, net content, packaging, shelf life, batch size, MOQ, toll price. */
export async function saveSigProduct(fd: FormData) {
  const { offer, admin } = await ownSignature(fd, 3);
  const prodId = uuid(fd.get("product_id"));
  const back = (q: string): never => go(formPath(offer.id, 3, `${q}${prodId ? `&prod=${prodId}` : "&prod=new"}`));
  const product_name = str(fd, "product_name", 150);
  const product_type = pick(fd.get("product_type"), PRODUCT_TYPES);
  const net_content = str(fd, "net_content", 60);
  const packaging = str(fd, "packaging", 500);
  const site_id = uuid(fd.get("site_id"));
  const shelf = parseCount(fd.get("shelf_life_months"), 120);
  const batch_size = parseCount(fd.get("batch_size"), 10_000_000);
  const moq = parseCount(fd.get("moq"), 10_000_000);
  const lead = parseCount(fd.get("lead_time_days"), 365);
  const sample_qty = parseCount(fd.get("sample_qty"), 100000);
  if (!product_name || product_name.length < 2 || !product_type || !net_content || !packaging || packaging.length < 3 || !site_id) back("error=product");
  if ([shelf, batch_size, moq, lead, sample_qty].some((n) => Number.isNaN(n)) || !shelf || !batch_size || !moq || sample_qty === 0) back("error=product");
  if (moq! > batch_size! * 100) back("error=product");
  const { data: site } = await admin.from("signature_sites").select("id").eq("id", site_id!).eq("offer_id", offer.id).maybeSingle();
  if (!site) back("error=product");
  const fda_needed = yesNo(fd.get("fda_needed"));
  const cpr_status = pick(fd.get("cpr_status"), CPR_STATUS);
  const cpr_no = str(fd, "cpr_no", 60);
  if (fda_needed === null || !cpr_status) back("error=cpr");
  if ((fda_needed && cpr_status === "not_needed") || (!fda_needed && cpr_status !== "not_needed") || (cpr_status === "registered" && !cpr_no)) back("error=cpr");
  const toll_price = parseMoney(fd.get("toll_price"));
  const srp = parseMoney(fd.get("suggested_srp"));
  if (Number.isNaN(toll_price) || Number.isNaN(srp) || !toll_price || toll_price <= 0 || srp === 0) back("error=price");
  const row = {
    site_id, product_name, description: str(fd, "description", 1000), product_type, fda_needed, cpr_status, cpr_no: cpr_status === "not_needed" ? null : cpr_no,
    cpr_holder: fda_needed ? pick(fd.get("cpr_holder"), CPR_HOLDER) : null, net_content, packaging, shelf_life_months: shelf, storage: str(fd, "storage", 200),
    batch_size, moq, toll_price, price_includes: pick(fd.get("price_includes"), PRICE_INCLUDES) ?? "formula_and_packaging", suggested_srp: srp, lead_time_days: lead, sample_qty,
  };
  if (prodId) {
    const { error } = await admin.from("signature_products").update(row).eq("id", prodId).eq("offer_id", offer.id);
    if (error) back("error=failed");
  } else {
    const { data: rows } = await admin.from("signature_products").select("position").eq("offer_id", offer.id).order("position", { ascending: false }).limit(MAX_SIG_PRODUCTS);
    if ((rows?.length ?? 0) >= MAX_SIG_PRODUCTS) back("error=product_limit");
    const { error } = await admin.from("signature_products").insert({ ...row, offer_id: offer.id, position: Math.min(100, (rows?.[0]?.position ?? 0) + 1) });
    if (error) back("error=failed");
  }
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 3, "done=product_saved"));
}

export async function deleteSigProduct(fd: FormData) {
  const { offer, admin } = await ownSignature(fd, 3);
  const prodId = uuid(fd.get("product_id"));
  if (!prodId) go(formPath(offer.id, 3, "error=failed"));
  const { error } = await admin.from("signature_products").delete().eq("id", prodId!).eq("offer_id", offer.id);
  if (error) go(formPath(offer.id, 3, "error=failed"));
  revalidatePath(`${HOME}/${offer.id}`);
  go(formPath(offer.id, 3, "done=product_deleted"));
}
