// Partner accreditation (Step 7): Toll Manufacturer / FLAME Signature. Pure rules and plain words for the FLAME
// Signature proposal (the shared supplier_offers table, kind 'manufacturer'), its sites and products, the regulatory
// and legal reviews, the FLAME Signature licence (approved products and territories) and batch records. Used by
// /partner-us/offers, /partner-us/signature, Admin > Partners > FLAME Signature, the comparison screen and the tests.
// The database (0037_signature_manufacturing.sql) enforces the same kinds, limits and rules.
// Statuses, scoring weights, the pass mark, the money notice and parsing helpers are REUSED from ./offers.

import { withVat, type OfferRow, type VatBasis } from "./offers";

export const SIGNATURE_CATEGORIES = {
  sauces_condiments: "Sauces, condiments and spreads",
  snacks_bakery: "Snacks, bakery and confectionery",
  beverages: "Beverages and drink mixes",
  coffee_tea_cocoa: "Coffee, tea and cocoa",
  frozen_processed: "Frozen and processed food",
  food_supplements: "Food supplements",
  skincare_cosmetics: "Skincare and cosmetics",
  soap_personal_care: "Soap and personal care",
  household_cleaning: "Household cleaning products",
  agri_inputs: "Farm inputs (fertilizer, feeds)",
  other: "Other products",
} as const;
export type SignatureCategory = keyof typeof SIGNATURE_CATEGORIES;

/** Who owns the formula (recipe). */
export const FORMULA_OWNERSHIP = {
  flame: { label: "FLAME PH owns the formula", help: "You make it to FLAME PH's recipe or develop it for FLAME PH; you keep it confidential and do not use it for other brands." },
  manufacturer: { label: "We keep our own formula", help: "You make it from your existing formula and let FLAME PH sell it under the FLAME Signature name." },
  joint: { label: "Developed together", help: "Both sides contribute; who owns what is written in the agreement." },
  licensed: { label: "Licensed from someone else", help: "The formula belongs to a third party who allowed you to use it (say who in the note)." },
} as const;
export type FormulaOwnership = keyof typeof FORMULA_OWNERSHIP;

export const PACKAGING_SUPPLY = {
  manufacturer: "We supply the packaging and labels",
  flame: "FLAME PH supplies the packaging and labels",
  either: "Either; we agree per product",
} as const;
export type PackagingSupply = keyof typeof PACKAGING_SUPPLY;

export const PRODUCT_TYPES = {
  food: "Food", beverage: "Beverage", food_supplement: "Food supplement", cosmetic: "Cosmetic",
  household_chemical: "Household cleaning product", agri_input: "Farm input", other: "Other",
} as const;
export type ProductType = keyof typeof PRODUCT_TYPES;
/** Usually needs FDA (product registration and an FDA License to Operate at the plant). */
export const FDA_TYPICAL: ProductType[] = ["food", "beverage", "food_supplement", "cosmetic", "household_chemical"];

export const CPR_STATUS = {
  registered: "Already registered with FDA",
  will_register: "To be registered with FDA before selling",
  not_needed: "FDA registration not needed",
} as const;
export type CprStatus = keyof typeof CPR_STATUS;
export const CPR_HOLDER = { manufacturer: "Registered in our name", flame: "To be registered in FLAME PH's name", to_agree: "To be agreed" } as const;
export type CprHolder = keyof typeof CPR_HOLDER;

export const PRICE_INCLUDES = {
  formula_and_packaging: "Ingredients, packaging, labels and labour",
  formula_only: "Ingredients and labour (packaging supplied by FLAME PH)",
  labor_only: "Labour only (ingredients and packaging supplied by FLAME PH)",
} as const;
export type PriceIncludes = keyof typeof PRICE_INCLUDES;

/** The five screens of the FLAME Signature form (same layout as the supplier form). */
export const SIGNATURE_STEPS = [
  { n: 1, key: "about", title: "About the proposal", fil: "Tungkol sa alok" },
  { n: 2, key: "sites", title: "Manufacturing sites", fil: "Mga planta" },
  { n: 3, key: "products", title: "Products", fil: "Mga produkto" },
  { n: 4, key: "quality", title: "Quality, recall and files", fil: "Kalidad, recall at mga file" },
  { n: 5, key: "send", title: "Licence terms and send", fil: "Lisensya at ipadala" },
] as const;

// ------------------------------------------------------------------------------------------------------------------
// Limits (Supabase Free plan). The database refuses more than 20 proposals, 5 sites and 15 products.
// ------------------------------------------------------------------------------------------------------------------
export const MAX_SITES = 5;
export const MAX_SIG_PRODUCTS = 15;

export const SIGNATURE_FILE_TYPES = {
  fda: { label: "FDA License to Operate (LTO)", help: "The current LTO of each plant that makes FDA-regulated products." },
  cpr: { label: "FDA product registration (CPR or notification)", help: "For products already registered." },
  certification: { label: "GMP, HACCP, Halal or ISO certificate", help: "Certificates of your plant or quality system." },
  lab_report: { label: "Lab report or certificate of analysis", help: "Recent test results of a product or sample batch." },
  packaging_art: { label: "Packaging or label design", help: "A draft label or packaging photo. FLAME Signature labels are approved by the national team." },
  product_photo: { label: "Product photo", help: "A clear photo of the product or a sample." },
  spec_sheet: { label: "Product specification", help: "Specification sheet. Do not upload a secret formula; a summary is enough." },
  other: { label: "Other file", help: "Company profile, recall plan or anything that helps." },
} as const;
export type SignatureFileType = keyof typeof SIGNATURE_FILE_TYPES;
export const SIGNATURE_FILE_KEYS = Object.keys(SIGNATURE_FILE_TYPES) as SignatureFileType[];
export const isSignatureFileType = (v: unknown): v is SignatureFileType => typeof v === "string" && v in SIGNATURE_FILE_TYPES;

/** The FLAME Signature trademark licence terms the manufacturer accepts before sending. Version stored with the offer. */
export const IP_TERMS_VERSION = "v1.0";
export const IP_TERMS = {
  en: [
    "The FLAME Signature name and logo belong to FLAME PH. You get no ownership of them.",
    "You may put the FLAME Signature mark only on products the national team approved in writing, made at the approved sites, and only while a FLAME Signature licence is active.",
    "Products under the mark are sold only in the territories named in the licence. Making the product (manufacturing rights) and selling it (distribution rights) are separate rights.",
    "Every batch is recorded with its lot number, dates and quality check, and is released for sale only by the national team. You keep batch records and help with any recall.",
    "Formulas, labels and business information you receive from FLAME PH stay confidential. Who owns the formula is as stated in this proposal and the signed agreement.",
    "The signed agreement with MarketplacePH Online Store governs prices, money, liability and termination. Nothing here is final until that agreement is signed after legal review.",
  ],
  tl: "Ang FLAME Signature na pangalan at logo ay pag-aari ng FLAME PH. Gagamitin lang ito sa mga produktong inaprubahan, sa mga aprubadong planta at teritoryo, habang aktibo ang lisensya.",
} as const;

export const SIGNATURE_DECLARATION = {
  en: "I confirm that these products, prices, sites, permits and quality systems are true and that my business can honour them until the date I gave. I understand the FLAME Signature mark is used only under a written licence, that the commission is a proposal to be negotiated, and that flameph.org does not collect or hold any money.",
  tl: "Pinapatunayan kong totoo ang mga produkto, presyo, planta, permit at sistema ng kalidad, at kaya itong ibigay ng aming negosyo hanggang sa petsang ibinigay ko.",
} as const;

// ------------------------------------------------------------------------------------------------------------------
// Scoring. The SAME five parts, maximums (30/25/20/15/10) and pass mark as supplier offers (same database columns).
// ------------------------------------------------------------------------------------------------------------------
export const SIGNATURE_SCORE_LABELS = {
  price_value: { label: "Toll price and member value", help: "Toll price per unit with VAT for comparable products, what the price includes, room for a fair member price." },
  quality_samples: { label: "Product quality and sample batches", help: "Sample batch results from chapter testers and the team, lab reports, shelf life, packaging quality." },
  compliance_reliability: { label: "Permits, regulatory and quality systems", help: "Current FDA License to Operate, product registration plan, GMP/HACCP, testing, batch records, traceability and recall readiness." },
  commission_benefits: { label: "Commission and chapter benefits", help: "The proposed commission and other benefits for members and chapters." },
  logistics_support: { label: "Capacity, lead time and supply", help: "Monthly capacity, MOQ and batch size, lead time, delivery areas, who supplies packaging." },
} as const;
export const SIGNATURE_GATE_HELP = "Pass only if the manufacturer is accredited, every plant making FDA-regulated products has a current FDA License to Operate, products have a clear FDA registration plan, the plant follows GMP, and batch records, traceability and a recall plan are in place. The regulatory and legal reviews below must also clear this version before it can be chosen.";

export const SIGNATURE_REASONS = {
  price_high: "The toll prices are higher than other proposals",
  lto: "An FDA License to Operate is missing, unclear or expiring",
  registration: "The FDA product registration plan needs work",
  gmp: "Plant hygiene, GMP or certifications were not enough",
  samples: "Sample batches did not meet the quality we need",
  testing: "Quality testing or lab reports are not enough",
  traceability: "Batch records or traceability need work",
  recall: "The recall plan needs work",
  capacity: "Capacity, MOQ or lead time does not fit",
  packaging: "Packaging or labels need changes",
  formula: "Formula ownership or confidentiality needs discussion",
  info_missing: "Some information or files are missing or unclear",
  commission: "The commission proposal needs discussion",
  other: "Other reason (see the note)",
} as const;
export type SignatureReason = keyof typeof SIGNATURE_REASONS;
export const SIGNATURE_REASON_KEYS = Object.keys(SIGNATURE_REASONS) as SignatureReason[];
export const isSignatureReason = (v: unknown): v is SignatureReason => typeof v === "string" && v in SIGNATURE_REASONS;

// ------------------------------------------------------------------------------------------------------------------
// Regulatory and legal reviews. The same lists as public.signature_review_items() in 0037: a review clears only with
// every item ticked.
// ------------------------------------------------------------------------------------------------------------------
export const REVIEW_ITEMS = {
  regulatory: {
    lto_valid: "Each plant's FDA License to Operate is current (checked on the FDA verification portal)",
    product_registration: "Each product has an FDA registration or a clear plan to register before sale",
    labeling: "Draft labels follow FDA labeling rules (name, net content, ingredients, lot, expiry, manufacturer)",
    gmp_haccp: "The plant follows GMP (and HACCP where needed)",
    testing: "Quality checks on every batch and lab tests are adequate",
    traceability: "Lot coding and batch records let us trace each batch to its raw materials",
    recall: "There is a written recall plan with a named contact",
  },
  legal: {
    formula_ownership: "Formula ownership is clear and acceptable",
    ip_license: "The FLAME Signature licence terms were accepted and fit this proposal",
    trademark_scope: "Use of the mark is limited to approved products and territories",
    confidentiality: "Confidentiality of formulas and business information is covered",
    liability: "Product liability, recalls and insurance are addressed",
    territory_rights: "Manufacturing and distribution rights do not conflict with existing appointments",
  },
} as const;
export type ReviewType = keyof typeof REVIEW_ITEMS;
export const REVIEW_TYPE_LABEL: Record<ReviewType, string> = { regulatory: "Regulatory review", legal: "Legal review" };
export const isReviewType = (v: unknown): v is ReviewType => v === "regulatory" || v === "legal";
export const reviewKeys = (t: ReviewType) => Object.keys(REVIEW_ITEMS[t]);
export type ReviewRow = { id: string; revision: number; review_type: ReviewType; outcome: "cleared" | "not_cleared"; checklist: string[]; note: string; reviewer_id: string | null; created_at: string };
/** The latest review of each type for this version, and whether both cleared (same rule as signature_cleared()). */
export function reviewState(rows: Pick<ReviewRow, "revision" | "review_type" | "outcome" | "created_at">[], revision: number) {
  const latest = (t: ReviewType) => rows.filter((r) => r.revision === revision && r.review_type === t).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const regulatory = latest("regulatory");
  const legal = latest("legal");
  return { regulatory: regulatory?.outcome ?? null, legal: legal?.outcome ?? null, cleared: regulatory?.outcome === "cleared" && legal?.outcome === "cleared" };
}
/** A review may be marked "cleared" only with every item ticked. */
export const canClear = (t: ReviewType, ticked: string[]) => reviewKeys(t).every((k) => ticked.includes(k));

// ------------------------------------------------------------------------------------------------------------------
// Rows and columns
// ------------------------------------------------------------------------------------------------------------------
export type SiteRow = {
  id: string; position: number; site_name: string; site_type: "own" | "contract"; operator_name: string | null; address: string; city_code: string;
  place_label: string; province_code: string | null; region_code: string | null; lto_no: string | null; lto_valid_until: string | null;
  certifications: string | null; monthly_capacity: string; production_lines: string | null;
};
export const SITE_COLS = "id, position, site_name, site_type, operator_name, address, city_code, place_label, province_code, region_code, lto_no, lto_valid_until, certifications, monthly_capacity, production_lines";

export type Approval = "pending" | "approved" | "not_approved";
export const APPROVAL = {
  pending: { label: "Waiting for the national team", tone: "info" },
  approved: { label: "Approved for FLAME Signature", tone: "ok" },
  not_approved: { label: "Not approved", tone: "warn" },
} as const;
export type SigProductRow = {
  id: string; position: number; site_id: string | null; product_name: string; description: string | null; product_type: ProductType; fda_needed: boolean;
  cpr_status: CprStatus; cpr_no: string | null; cpr_holder: CprHolder | null; net_content: string; packaging: string; shelf_life_months: number;
  storage: string | null; batch_size: number; moq: number; toll_price: number; price_includes: PriceIncludes; suggested_srp: number | null;
  lead_time_days: number | null; sample_qty: number | null; approval: Approval; approval_note: string | null; approved_by: string | null; approved_at: string | null;
};
export const SIG_PRODUCT_COLS = "id, position, site_id, product_name, description, product_type, fda_needed, cpr_status, cpr_no, cpr_holder, net_content, packaging, shelf_life_months, storage, batch_size, moq, toll_price, price_includes, suggested_srp, lead_time_days, sample_qty, approval, approval_note, approved_by, approved_at";

export type SignatureOfferRow = OfferRow & {
  kind: "supplier" | "service" | "manufacturer"; signature_category: SignatureCategory | null; formulation_ownership: FormulaOwnership | null;
  formulation_note: string | null; rnd_support: boolean | null; qc_testing: string | null; lab_partner: string | null; traceability: string | null;
  batch_record_years: number | null; recall_plan: string | null; recall_contact: string | null; mock_recall_on: string | null;
  packaging_supply: PackagingSupply | null; ip_terms_version: string | null; ip_terms_accepted_at: string | null;
};
/** Without "kind" (SERVICE_COLS carries it), so the two can be selected together. */
export const SIGNATURE_COLS = "signature_category, formulation_ownership, formulation_note, rnd_support, qc_testing, lab_partner, traceability, batch_record_years, recall_plan, recall_contact, mock_recall_on, packaging_supply, ip_terms_version, ip_terms_accepted_at";

// ------------------------------------------------------------------------------------------------------------------
// Checks. Saving a draft checks formats only; sending checks that everything required is there.
// ------------------------------------------------------------------------------------------------------------------
export type Missing = { step: number; what: string };
const todayManila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** What still needs an answer before sending a FLAME Signature proposal, with the screen to fix it on. */
export function signatureMissing(
  o: Pick<SignatureOfferRow, "title" | "signature_category" | "formulation_ownership" | "rnd_support" | "valid_until" | "vat_basis" | "serviceable_areas"
    | "lead_time_days" | "packaging_supply" | "sample_availability" | "qc_testing" | "traceability" | "batch_record_years" | "recall_plan" | "recall_contact" | "commission_pct">,
  sites: Pick<SiteRow, "id" | "site_name" | "lto_no" | "lto_valid_until">[],
  products: Pick<SigProductRow, "product_name" | "site_id" | "fda_needed">[],
  today = todayManila(),
): Missing[] {
  const out: Missing[] = [];
  const need = (v: unknown, step: number, what: string) => { if (v === null || v === undefined || String(v).trim() === "") out.push({ step, what }); };
  need(o.title, 1, "Name of the proposal");
  need(o.signature_category, 1, "Kind of products");
  need(o.formulation_ownership, 1, "Who owns the formula");
  need(o.rnd_support, 1, "Whether you can develop or adjust formulas");
  need(o.valid_until, 1, "Prices valid until");
  if (o.valid_until && o.valid_until < today) out.push({ step: 1, what: "Prices valid until: the date has passed" });
  need(o.vat_basis, 1, "VAT");
  need(o.serviceable_areas, 1, "Where you deliver finished goods");
  need(o.lead_time_days, 1, "Days from purchase order to delivery");
  need(o.packaging_supply, 1, "Who supplies packaging and labels");
  if (sites.length === 0) out.push({ step: 2, what: "At least one manufacturing site" });
  for (const s of sites) if (s.lto_valid_until && s.lto_valid_until < today) out.push({ step: 2, what: `${s.site_name}: the FDA License to Operate has expired` });
  if (products.length === 0) out.push({ step: 3, what: "At least one product" });
  for (const p of products) {
    const site = sites.find((s) => s.id === p.site_id);
    if (!site) out.push({ step: 3, what: `${p.product_name}: choose where it is made` });
    else if (p.fda_needed && (!site.lto_no || (site.lto_valid_until ?? "") < today)) out.push({ step: 2, what: `${p.product_name} needs FDA: add a current FDA License to Operate for ${site.site_name}` });
  }
  need(o.sample_availability, 4, "Sample batches");
  need(o.qc_testing, 4, "How you test each batch");
  need(o.traceability, 4, "Batch records and traceability");
  need(o.batch_record_years, 4, "Years you keep batch records");
  need(o.recall_plan, 4, "Recall plan");
  need(o.recall_contact, 4, "Recall contact person");
  need(o.commission_pct, 5, "Proposed commission (type 0 if none)");
  return out;
}

/** Per-unit landed cost of one product for the comparison: toll price with VAT. */
export const unitCost = (p: Pick<SigProductRow, "toll_price">, vat: VatBasis | null | undefined) => Math.round(withVat(Number(p.toll_price), vat) * 100) / 100;
/** Price per 100 g / 100 ml when the net content is a simple number with g, kg, ml or L, so sizes compare fairly. */
export function per100(p: Pick<SigProductRow, "toll_price" | "net_content">, vat: VatBasis | null | undefined): { value: number; unit: "g" | "ml" } | null {
  const m = /^\s*([\d.]+)\s*(g|kg|ml|l)\b/i.exec(p.net_content.replace(",", ""));
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  const u = m[2].toLowerCase();
  const base = u === "kg" ? n * 1000 : u === "l" ? n * 1000 : n;
  return { value: Math.round((withVat(Number(p.toll_price), vat) / base) * 100 * 100) / 100, unit: u === "g" || u === "kg" ? "g" : "ml" };
}

/**
 * Side-by-side comparison of FLAME Signature proposals: for each product type, the lowest toll price per 100 g or 100 ml
 * (with VAT) in each proposal, the best among all, and a SUGGESTED price score out of 30 on the product type the
 * proposals share most. The reviewer decides the real score.
 */
export function compareSignature(offers: { id: string; vat_basis: VatBasis | null; products: Pick<SigProductRow, "product_type" | "toll_price" | "net_content">[] }[]) {
  const best: Record<string, number> = {};
  const per = offers.map((o) => {
    const low: Record<string, number> = {};
    for (const p of o.products) {
      const q = per100(p, o.vat_basis);
      if (!q) continue;
      const k = `${p.product_type}:${q.unit}`;
      if (low[k] === undefined || q.value < low[k]) low[k] = q.value;
    }
    for (const [k, v] of Object.entries(low)) if (best[k] === undefined || v < best[k]) best[k] = v;
    return { id: o.id, low };
  });
  const shared = (k: string) => per.filter((q) => q.low[k] !== undefined).length;
  return per.map((p) => {
    const k = Object.keys(p.low).filter((x) => shared(x) > 1).sort((a, b) => shared(b) - shared(a))[0];
    return {
      id: p.id, lowest: p.low, isBest: Object.fromEntries(Object.entries(p.low).map(([x, v]) => [x, Math.abs(v - best[x]) < 1e-9])),
      suggestedPriceScore: k ? Math.round(30 * (best[k] / p.low[k])) : null, suggestedBasis: k ?? null,
    };
  });
}
/** "food:g" -> "Food, per 100 g". */
export const compareKeyLabel = (k: string) => { const [t, u] = k.split(":"); return `${PRODUCT_TYPES[t as ProductType] ?? t}, per 100 ${u}`; };

// ------------------------------------------------------------------------------------------------------------------
// Licences and batches
// ------------------------------------------------------------------------------------------------------------------
export const LICENCE_STATUS = {
  draft: { label: "Draft (not active)", tone: "info" },
  active: { label: "Active", tone: "ok" },
  suspended: { label: "Suspended", tone: "warn" },
  ended: { label: "Ended", tone: "info" },
  cancelled: { label: "Cancelled", tone: "info" },
} as const;
export type LicenceStatus = keyof typeof LICENCE_STATUS;
export type LicenceRow = {
  id: string; ref_no: string; partner_user_id: string | null; partner_name: string; offer_id: string | null; product_ids: string[]; site_ids: string[];
  mfg_appointment_ids: string[]; dist_appointment_ids: string[]; start_date: string | null; end_date: string | null; terms_note: string | null;
  status: LicenceStatus; approved_at: string | null; changed_at: string | null; status_reason: string | null; created_at: string;
};
export const LICENCE_COLS = "id, ref_no, partner_user_id, partner_name, offer_id, product_ids, site_ids, mfg_appointment_ids, dist_appointment_ids, start_date, end_date, terms_note, status, approved_at, changed_at, status_reason, created_at";

export const BATCH_TYPES = {
  sample: { label: "Sample batch", help: "Small batch for tests by chapter testers and the national team. Never sold under the mark." },
  pilot: { label: "Pilot batch", help: "Trial run on the production line. Never sold under the mark." },
  production: { label: "Production batch", help: "For sale under the FLAME Signature mark. Needs an active licence for the product and site; released only by the national team." },
} as const;
export type BatchType = keyof typeof BATCH_TYPES;
export const BATCH_STATUS = {
  recorded: { label: "Recorded (not released)", tone: "info" },
  released: { label: "Released for sale", tone: "ok" },
  on_hold: { label: "On hold", tone: "warn" },
  rejected: { label: "Rejected", tone: "danger" },
  recalled: { label: "RECALLED", tone: "danger" },
} as const;
export type BatchStatus = keyof typeof BATCH_STATUS;
export const QC_RESULT = { pending: "Not checked yet", pass: "Passed", fail: "Failed" } as const;
export type QcResult = keyof typeof QC_RESULT;
export const RECALL_SCOPE = {
  consumer: "Consumer level (members and buyers who have it)",
  retail: "Retail level (stores and resellers)",
  wholesale: "Wholesale level (distributors and warehouses)",
} as const;
export type RecallScope = keyof typeof RECALL_SCOPE;
export type BatchRow = {
  id: string; ref_no: string; partner_user_id: string | null; offer_id: string | null; product_id: string | null; site_id: string | null; licence_id: string | null;
  product_name: string; batch_type: BatchType; lot_no: string; produced_on: string; expiry_on: string; quantity: number; unit: string;
  raw_material_lots: string | null; qc_result: QcResult; qc_note: string | null; status: BatchStatus; status_reason: string | null; status_at: string | null;
  recall_scope: RecallScope | null; created_at: string;
};
export const BATCH_COLS = "id, ref_no, partner_user_id, offer_id, product_id, site_id, licence_id, product_name, batch_type, lot_no, produced_on, expiry_on, quantity, unit, raw_material_lots, qc_result, qc_note, status, status_reason, status_at, recall_scope, created_at";

/** The national team's moves on a batch (same as the database). */
export const BATCH_MOVES: Record<BatchStatus, BatchStatus[]> = {
  recorded: ["released", "on_hold", "rejected"],
  on_hold: ["released", "rejected", "recalled"],
  released: ["on_hold", "recalled"],
  rejected: [],
  recalled: [],
};
export const BATCH_MOVE_LABEL: Record<BatchStatus, string> = {
  released: "Release for sale", on_hold: "Put on hold", rejected: "Reject", recalled: "Recall", recorded: "Recorded",
};
export const BATCH_FILE_TYPES = {
  coa: { label: "Certificate of analysis", help: "Lab results for this batch." },
  lab_report: { label: "Lab report", help: "Microbiology, shelf-life or other tests." },
  batch_photo: { label: "Photo of the batch or label", help: "Shows the lot number and expiry on the label." },
  other: { label: "Other file", help: "Batch record sheet or anything that helps." },
} as const;
export type BatchFileType = keyof typeof BATCH_FILE_TYPES;
export const BATCH_FILE_KEYS = Object.keys(BATCH_FILE_TYPES) as BatchFileType[];
export const isBatchFileType = (v: unknown): v is BatchFileType => typeof v === "string" && v in BATCH_FILE_TYPES;
export const MAX_BATCH_FILES = 4;

/** Latest expiry allowed for a batch: the production date plus the shelf life in months (same as the database). */
export function maxExpiry(producedOn: string, shelfLifeMonths: number) {
  const [y, m, d] = producedOn.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + shelfLifeMonths, d));
  // Like Postgres: adding months to the 31st lands on the last day of a shorter month.
  if (t.getUTCDate() !== d) t.setUTCDate(0);
  return t.toISOString().slice(0, 10);
}
export const LOT_RE = /^[A-Za-z0-9][A-Za-z0-9 ._/-]{0,59}$/;

export const SIGNATURE_ERRORS: Record<string, string> = {
  not_manufacturer: "FLAME Signature proposals are for accredited toll manufacturers. Apply as a toll manufacturer first; once the national team approves you, you can send proposals.",
  site_limit: `A proposal can have up to ${MAX_SITES} manufacturing sites.`,
  product_limit: `A proposal can have up to ${MAX_SIG_PRODUCTS} products. Make a second proposal for the rest.`,
  site: "Please give the site a name, the full address, the city or municipality, and the monthly capacity. A contract plant needs the operator's name.",
  city: "Please choose the city or municipality from the list.",
  lto: "Please give both the FDA License to Operate number and its validity date (or leave both empty).",
  product: "Please fill in the product name, net content, packaging, shelf life, batch size, MOQ and toll price, and choose where it is made.",
  cpr: "Please check the FDA registration: a product that needs FDA can't be \"not needed\", and a registered product needs its registration number.",
  price: "Please check the prices: numbers only, like 28.50. The toll price must be more than zero.",
  ip_terms: "Please read and accept the FLAME Signature licence terms.",
  batch: "Please check the batch: product, site, lot number (letters, numbers, - . / only), dates and quantity.",
  batch_dates: "Please check the dates: the production date can't be in the future, and the expiry date must be after it and within the product's shelf life.",
  batch_licence: "A production batch needs an active FLAME Signature licence for this product and site on the production date. Record it as a sample or pilot batch, or ask the national team about the licence.",
  batch_locked: "This batch was already reviewed by the national team and can no longer be changed.",
  qc_note: "Please say what failed in the quality check.",
  duplicate_lot: "That lot number is already recorded for this product.",
  batch_limit: "You can record up to 50 batches a day. Please continue tomorrow.",
  too_many_batch: `A batch can have up to 4 files. Delete one first.`,
  licence: "Please check the licence: choose the products, sites and manufacturing rights, and give dates (up to 10 years).",
  licence_reason: "Please give the reason.",
  review: "Please tick every item before marking the review cleared, or choose \"Not cleared\" and say what is missing.",
  review_note: "Please say what is missing or wrong.",
  conflict: "Declare that you have no conflict of interest with this partner first (on the review page).",
  mixed: "Compare only proposals of the same kind (all FLAME Signature, all supplier or all service).",
};
export const SIGNATURE_DONE: Record<string, string> = {
  batch_saved: "Batch saved.",
  batch_deleted: "Batch deleted.",
  uploaded: "File received. It is encrypted and only the national review team can open it.",
  deleted: "File deleted.",
  status: "Batch status changed.",
  licence_saved: "Licence saved.",
  licence_status: "Licence status changed.",
  review_saved: "Review saved.",
  product_decided: "Product decision saved.",
};

/** Messages on the national team's FLAME Signature pages (Admin > Partners > FLAME Signature). */
export const SIGNATURE_ADMIN_ERRORS: Record<string, string> = {
  own: "This is your own business. Another member of the national team must handle it.",
  conflict: "Declare on the proposal's review page that you have no conflict of interest with this manufacturer first.",
  offer: "Choose a FLAME Signature proposal that was chosen as a Best Offer.",
  licence: "Please check the dates: the end must be after the start, up to 10 years.",
  licence_reason: "Please give the reason.",
  recall_scope: "Choose the level of the recall.",
  move: "That change is not possible from the current status.",
  empty_note: "Write the note first.",
  missing: "Not found.",
  failed: "That didn't go through. Please try again.",
};
