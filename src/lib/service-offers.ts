// Partner accreditation (Step 6): Service Provider Best Offer. Pure rules and plain words for the service side of the
// shared Best Offer (the same supplier_offers table, kind 'service'), used by /partner-us/offers, the server actions,
// Admin > Partners > Service offers, the comparison screen and the tests. The database
// (0036_service_offers.sql) enforces the same kinds, limits, rate rules and the "no blanket guarantee" rule.
// Statuses, scoring weights, the pass mark, the money notice and parsing helpers are REUSED from ./offers.

import { parseCount, parseMoney, withVat, type OfferRow, type VatBasis } from "./offers";

export type OfferKind = "supplier" | "service";
export const isKind = (v: unknown): v is OfferKind => v === "supplier" || v === "service";

export const SERVICE_CATEGORIES = {
  accounting_tax: "Accounting, bookkeeping and tax",
  legal_permits: "Legal, permits and registration",
  marketing_digital: "Marketing and social media",
  design_printing: "Design, printing and packaging design",
  it_web: "IT, websites and apps",
  logistics_delivery: "Logistics, delivery and warehousing",
  repairs_maintenance: "Repairs and maintenance",
  training_coaching: "Training and coaching",
  photo_video: "Photo and video",
  business_consulting: "Business consulting",
  hr_staffing: "HR, payroll and staffing",
  food_safety_testing: "Food safety, lab tests and FDA help",
  construction_renovation: "Construction and renovation",
  cleaning_sanitation: "Cleaning, pest control and sanitation",
  other: "Other services",
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

export const SERVICE_MODES = {
  onsite: "On-site only (we go to the member)",
  remote: "Remote only (online, phone or by courier)",
  both: "On-site and remote",
} as const;
export type ServiceMode = keyof typeof SERVICE_MODES;

export const FREE_TRIAL = {
  free_consultation: "Free first consultation",
  free_trial: "Free trial or sample job",
  both: "Free consultation and a free trial",
  none: "No free consultation or trial",
} as const;
export type FreeTrial = keyof typeof FREE_TRIAL;

/** How a package is priced. The comparison puts packages with the same basis side by side. */
export const RATE_BASIS = {
  package: { label: "per package", short: "package", help: "One fixed price for the whole job" },
  hour: { label: "per hour", short: "hour", help: "Hourly rate" },
  day: { label: "per day", short: "day", help: "Daily rate" },
  month: { label: "per month", short: "month", help: "Monthly retainer or subscription" },
  unit: { label: "per unit", short: "unit", help: "Per employee, per 100 flyers, per km and so on (say which)" },
} as const;
export type RateBasis = keyof typeof RATE_BASIS;
export const rateLabel = (b: RateBasis, unit?: string | null) => (b === "unit" && unit ? `per ${unit.replace(/^per\s+/i, "")}` : RATE_BASIS[b].label);

/** The five screens of the service offer form (same layout as the supplier form). */
export const SERVICE_STEPS = [
  { n: 1, key: "about", title: "About the service", fil: "Tungkol sa serbisyo" },
  { n: 2, key: "packages", title: "Packages and rates", fil: "Mga package at singil" },
  { n: 3, key: "standards", title: "Service standards", fil: "Pamantayan ng serbisyo" },
  { n: 4, key: "proof", title: "Past clients and files", fil: "Dating kliyente at mga file" },
  { n: 5, key: "send", title: "Commission and send", fil: "Commission at ipadala" },
] as const;

// ------------------------------------------------------------------------------------------------------------------
// Limits (Supabase Free plan). The database refuses more than 20 service offers, 15 packages and 5 references.
// ------------------------------------------------------------------------------------------------------------------
export const MAX_PACKAGES = 15;
export const MAX_MILESTONES = 6;
export const MAX_REFERENCES = 5;

export const SERVICE_FILE_TYPES = {
  portfolio: { label: "Sample of past work", help: "A report, design, before-and-after photo or certificate of completion. Hide clients' private details." },
  prc: { label: "Licence or accreditation", help: "PRC ID, TESDA certificate, DOLE, LTFRB or other licence for this service." },
  price_list: { label: "Rate card or quotation", help: "Your official rate card or a sample quotation (PDF or photo)." },
  certification: { label: "Certificate or training", help: "Trainings, ISO, insurance or other proof of quality." },
  other: { label: "Other file", help: "Company profile, brochure or anything that helps." },
} as const;
export type ServiceFileType = keyof typeof SERVICE_FILE_TYPES;
export const SERVICE_FILE_KEYS = Object.keys(SERVICE_FILE_TYPES) as ServiceFileType[];
export const isServiceFileType = (v: unknown): v is ServiceFileType => typeof v === "string" && v in SERVICE_FILE_TYPES;

export const SERVICE_DECLARATION = {
  en: "I confirm that these rates, packages and service standards are true and that my business can honour them for FLAME PH members until the date I gave. My past clients agreed to be contacted. I understand results are judged against the written scope of work and acceptance criteria, that the commission is a proposal to be negotiated, and that flameph.org does not collect or hold any money.",
  tl: "Pinapatunayan kong totoo ang mga singil, package at pamantayan ng serbisyo, at kaya itong ibigay ng aming negosyo sa mga FLAME PH member hanggang sa petsang ibinigay ko. Pumayag ang aming mga dating kliyente na sila ay tawagan.",
} as const;

/** Why there is no "100% satisfaction" promise. Shown on the form; the database refuses offers that make one. */
export const NO_GUARANTEE = {
  en: "Please do not promise \"100% satisfaction\" or \"satisfaction guaranteed\". Write what you will deliver and how the member can check it is done (for example: \"reports emailed by day 10 of the month\"). If something you promised is not met, say how you correct it or refund the unmet part.",
  tl: "Huwag mangako ng \"100% satisfaction\". Isulat kung ano ang ibibigay ninyo at paano masusuri ng member na tapos na ito.",
} as const;
/** Same test as public.service_blanket_guarantee() in 0036. */
export const BLANKET_GUARANTEE = /(100\s*(%|percent)|one hundred percent)\s*(customer\s*|client\s*)?satisf|satisfaction\s*(is\s*)?(guarantee|assured)|guarantee[ds]?\s*(your\s*|customer\s*|client\s*)?satisf|satisf\w*\s*or\s*(your\s*)?money\s*back/i;
export const hasBlanketGuarantee = (...texts: (string | null | undefined)[]) => BLANKET_GUARANTEE.test(texts.filter(Boolean).join(" "));

// ------------------------------------------------------------------------------------------------------------------
// Scoring. The SAME five parts, maximums (30/25/20/15/10) and pass mark as supplier offers (same database columns);
// for services they read as below. "Compare offers using cost, qualifications, service SLA and customer results."
// ------------------------------------------------------------------------------------------------------------------
export const SERVICE_SCORE_LABELS = {
  price_value: { label: "Cost and member value", help: "Member rates for the same kind of package, member discount, what is included for the price." },
  quality_samples: { label: "Qualifications and customer results", help: "Licences, training, years of work, portfolio, verified past clients, ratings from confirmed FLAME PH deals, trials by chapter testers, complaints." },
  compliance_reliability: { label: "Licences, compliance and service levels", help: "Licence current where needed, permits, response time, clear scope and measurable acceptance criteria, confidentiality and data handling." },
  commission_benefits: { label: "Commission and chapter benefits", help: "The proposed commission, free consultation or trial, and other benefits for members and chapters." },
  logistics_support: { label: "Availability, coverage and after-service", help: "Areas served or remote work, how soon work starts, capacity per month, correction and refund policy." },
} as const;
export const SERVICE_GATE_HELP = "Pass only if the provider is accredited, any licence the service needs is current, every package has a clear scope and measurable acceptance criteria, there is a fair correction or refund policy, and personal data is handled safely. No blanket \"100% satisfaction\" promises.";

export const SERVICE_REASONS = {
  rate_high: "The member rates are higher than other offers",
  member_value: "The member discount or what is included is too small",
  qualifications: "Qualifications, experience or portfolio were not enough",
  license: "A licence or accreditation is missing, unclear or expired",
  scope_unclear: "The scope of work or acceptance criteria are not clear or measurable",
  sla_weak: "Response time or service levels are too weak for members",
  references: "We could not verify your past clients",
  customer_results: "Results from past members or trials were not good enough",
  policy: "The correction, refund or confidentiality policy needs work",
  area_limited: "You serve too few member areas",
  availability: "Availability or capacity is too limited",
  info_missing: "Some information or files are missing or unclear",
  commission: "The commission proposal needs discussion",
  other: "Other reason (see the note)",
} as const;
export type ServiceReason = keyof typeof SERVICE_REASONS;
export const SERVICE_REASON_KEYS = Object.keys(SERVICE_REASONS) as ServiceReason[];
export const isServiceReason = (v: unknown): v is ServiceReason => typeof v === "string" && v in SERVICE_REASONS;

// ------------------------------------------------------------------------------------------------------------------
// Rows and columns
// ------------------------------------------------------------------------------------------------------------------
export type Milestone = { title: string; due_days: number | null };
export type PackageRow = {
  id: string; position: number; name: string; description: string | null; scope: string; exclusions: string | null; rate_basis: RateBasis;
  unit_label: string | null; normal_rate: number | null; member_rate: number; min_units: number; duration_days: number | null; milestones: Milestone[];
  acceptance_criteria: string; revisions_included: number;
};
export const PACKAGE_COLS = "id, position, name, description, scope, exclusions, rate_basis, unit_label, normal_rate, member_rate, min_units, duration_days, milestones, acceptance_criteria, revisions_included";

export type Verification = "pending" | "verified" | "not_verified";
export const VERIFICATION = {
  pending: { label: "Not checked yet", tone: "info" },
  verified: { label: "Verified by the national team", tone: "ok" },
  not_verified: { label: "Could not be verified", tone: "warn" },
} as const;
export type ReferenceRow = {
  id: string; position: number; client_name: string; client_contact: string; work_done: string; completed_on: string | null; client_consent: boolean;
  verification: Verification; client_rating: number | null; verification_note: string | null; verified_by: string | null; verified_at: string | null;
};
export const REFERENCE_COLS = "id, position, client_name, client_contact, work_done, completed_on, client_consent, verification, client_rating, verification_note, verified_by, verified_at";

export type ServiceOfferRow = OfferRow & {
  kind: OfferKind; service_category: ServiceCategory | null; profession: string | null; qualifications: string | null; license_required: boolean | null;
  license_body: string | null; license_no: string | null; license_valid_until: string | null; portfolio: string | null; service_mode: ServiceMode | null;
  free_trial: FreeTrial | null; trial_terms: string | null; availability: string | null; monthly_clients: number | null; response_hours: number | null;
  service_levels: string | null; correction_policy: string | null; refund_policy: string | null; confidentiality: string | null; handles_personal_data: boolean | null;
};
export const SERVICE_COLS = "kind, service_category, profession, qualifications, license_required, license_body, license_no, license_valid_until, portfolio, service_mode, free_trial, trial_terms, availability, monthly_clients, response_hours, service_levels, correction_policy, refund_policy, confidentiality, handles_personal_data";

// ------------------------------------------------------------------------------------------------------------------
// Checks. Saving a draft checks formats only; sending checks that everything required is there.
// ------------------------------------------------------------------------------------------------------------------
export type Missing = { step: number; what: string };
const todayManila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** What still needs an answer before sending a service offer, with the screen to fix it on. */
export function serviceMissing(
  o: Pick<ServiceOfferRow, "title" | "service_category" | "profession" | "qualifications" | "license_required" | "license_body" | "license_no" | "license_valid_until"
    | "valid_until" | "vat_basis" | "service_mode" | "serviceable_areas" | "free_trial" | "availability" | "lead_time_days" | "response_hours" | "correction_policy"
    | "refund_policy" | "confidentiality" | "handles_personal_data" | "commission_pct" | "portfolio">,
  packages: Pick<PackageRow, "name" | "scope" | "acceptance_criteria" | "exclusions" | "description" | "milestones">[],
  references: number, portfolioFiles: number, today = todayManila(),
): Missing[] {
  const out: Missing[] = [];
  const need = (v: unknown, step: number, what: string) => { if (v === null || v === undefined || String(v).trim() === "") out.push({ step, what }); };
  need(o.title, 1, "Name of the offer");
  need(o.service_category, 1, "Kind of service");
  need(o.profession, 1, "Your profession or trade");
  need(o.qualifications, 1, "Qualifications and experience");
  need(o.license_required, 1, "Whether the service needs a licence");
  if (o.license_required) {
    need(o.license_body, 1, "Who issued the licence");
    need(o.license_no, 1, "Licence number");
    if (o.license_valid_until && o.license_valid_until < today) out.push({ step: 1, what: "Licence valid until: the licence has expired" });
  }
  need(o.valid_until, 1, "Rates valid until");
  if (o.valid_until && o.valid_until < today) out.push({ step: 1, what: "Rates valid until: the date has passed" });
  need(o.vat_basis, 1, "VAT");
  need(o.service_mode, 1, "On-site or remote");
  need(o.serviceable_areas, 1, "Areas you serve");
  if (packages.length === 0) out.push({ step: 2, what: "At least one service package with its rates" });
  need(o.free_trial, 3, "Free consultation or trial");
  need(o.availability, 3, "Availability");
  need(o.lead_time_days, 3, "Days from booking until the work starts");
  need(o.response_hours, 3, "Hours to reply to a member");
  need(o.correction_policy, 3, "How you correct mistakes");
  need(o.refund_policy, 3, "Refund for work not delivered");
  need(o.confidentiality, 3, "Confidentiality and data handling");
  need(o.handles_personal_data, 3, "Whether you handle members' personal data");
  if (references === 0) out.push({ step: 4, what: "At least one past client we can call" });
  if (!o.portfolio?.trim() && portfolioFiles === 0) out.push({ step: 4, what: "Your portfolio: a short description or a sample of past work" });
  need(o.commission_pct, 5, "Proposed commission (type 0 if none)");
  const p = packages.map((k) => [k.name, k.description, k.scope, k.exclusions, k.acceptance_criteria, ...(k.milestones ?? []).map((m) => m.title)]).flat();
  if (hasBlanketGuarantee(...p)) out.push({ step: 2, what: "A package promises \"100% satisfaction\": write measurable acceptance criteria instead" });
  if (hasBlanketGuarantee(o.title, o.qualifications, o.portfolio, o.availability, o.correction_policy, o.refund_policy, o.confidentiality)) {
    out.push({ step: 3, what: "Remove the \"100% satisfaction\" promise: describe how you correct or refund instead" });
  }
  return out;
}

/** Milestones from the form: up to 6 rows of "what is delivered" and "by day N"; blank rows are skipped. */
export function parseMilestones(rows: { title: unknown; days: unknown }[]): Milestone[] | "bad" {
  const out: Milestone[] = [];
  for (const r of rows.slice(0, MAX_MILESTONES)) {
    const title = String(r.title ?? "").trim().slice(0, 150);
    const days = parseCount(r.days, 730);
    if (!title && days === null) continue;
    if (!title || Number.isNaN(days)) return "bad";
    out.push({ title, due_days: days });
  }
  return out;
}

/** A rate typed by the provider: reuses the supplier money check (numbers only, up to 2 decimals). */
export const parseRate = parseMoney;

/** Member discount against the normal rate, in percent (null without a normal rate). */
export function rateDiscount(p: Pick<PackageRow, "normal_rate" | "member_rate">): number | null {
  const n = Number(p.normal_rate);
  if (!p.normal_rate || !(n > 0)) return null;
  return Math.round(((n - Number(p.member_rate)) / n) * 1000) / 10;
}

/**
 * Side-by-side comparison of service offers: for each rate basis (per hour, per month, per package, ...) the lowest
 * member rate with VAT in each offer, the best among all offers, and a SUGGESTED cost score out of 30 (30 for the
 * lowest, less in proportion) on the basis the offers share most. Per-unit packages compare only with the same unit.
 * The reviewer decides the real score.
 */
export function compareServiceOffers(offers: { id: string; vat_basis: VatBasis | null; packages: Pick<PackageRow, "rate_basis" | "unit_label" | "member_rate" | "normal_rate">[] }[]) {
  const keyOf = (p: Pick<PackageRow, "rate_basis" | "unit_label">) => (p.rate_basis === "unit" ? `unit:${(p.unit_label ?? "").trim().toLowerCase()}` : p.rate_basis);
  const best: Record<string, number> = {};
  const perOffer = offers.map((o) => {
    const low: Record<string, number> = {};
    for (const p of o.packages) {
      const k = keyOf(p);
      const c = withVat(Number(p.member_rate), o.vat_basis);
      if (low[k] === undefined || c < low[k]) low[k] = c;
    }
    for (const [k, c] of Object.entries(low)) if (best[k] === undefined || c < best[k]) best[k] = c;
    const discounts = o.packages.map(rateDiscount).filter((d): d is number => d !== null);
    return { id: o.id, low, avgDiscount: discounts.length ? Math.round((discounts.reduce((a, b) => a + b, 0) / discounts.length) * 10) / 10 : null };
  });
  const shared = (k: string) => perOffer.filter((q) => q.low[k] !== undefined).length;
  return perOffer.map((p) => {
    const keys = Object.keys(p.low).filter((k) => shared(k) > 1).sort((a, b) => shared(b) - shared(a));
    const k = keys[0];
    const suggested = k ? Math.round(30 * (best[k] / p.low[k])) : null;
    const lowest = Object.fromEntries(Object.entries(p.low).map(([x, v]) => [x, Math.round(v * 100) / 100]));
    const isBest = Object.fromEntries(Object.entries(p.low).map(([x, v]) => [x, Math.abs(v - best[x]) < 1e-9]));
    return { id: p.id, lowest, isBest, avgDiscount: p.avgDiscount, suggestedPriceScore: suggested, suggestedBasis: k ?? null };
  });
}
/** "hour" -> "per hour"; "unit:per employee" -> "per employee". */
export const basisLabel = (k: string) => (k.startsWith("unit:") ? `per ${k.slice(5).replace(/^per\s+/, "") || "unit"}` : RATE_BASIS[k as RateBasis]?.label ?? k);

/**
 * Customer results the national team sees next to an offer: confirmed FLAME PH deals where the provider did the work
 * (ratings and endorsements the members gave, from member_reputation), complaints filed about the provider (Step 5),
 * trials by chapter testers (Step 5) and the past clients the team called.
 */
export type TrackRecord = {
  deals: number; ratingAvg: number | null; ratingCount: number; tags: Record<string, number>; shared: boolean;
  complaints: number; complaintsOpen: number; trials: number; trialAvg: number | null; safety: number;
  referencesVerified: number; referencesTotal: number; referenceRating: number | null;
};
export function referenceSummary(refs: Pick<ReferenceRow, "verification" | "client_rating">[]) {
  const v = refs.filter((r) => r.verification === "verified");
  const rated = v.map((r) => r.client_rating).filter((n): n is number => typeof n === "number");
  return { verified: v.length, total: refs.length, rating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null };
}

export const SERVICE_ERRORS: Record<string, string> = {
  not_provider: "Service offers are for accredited service providers. Apply as a service provider first; once the national team approves you, you can send offers.",
  package_limit: `An offer can have up to ${MAX_PACKAGES} packages. Make a second offer for the rest.`,
  reference_limit: `You can list up to ${MAX_REFERENCES} past clients.`,
  package: "Please give the package a name, what is included (at least a sentence), and measurable acceptance criteria (how the member checks it is done).",
  rate: "Please check the rates: numbers only, like 2800 or 450.50. The member rate can't be higher than the normal rate.",
  unit: "For a per-unit rate, say what the unit is, like \"per employee\" or \"per 100 flyers\".",
  milestones: "Please check the milestones: each needs what is delivered, and the day number must be a whole number.",
  guarantee: "Please remove the \"100% satisfaction\" or \"satisfaction guaranteed\" promise. Write measurable acceptance criteria and your correction or refund policy instead.",
  reference: "Please give the client's name, a phone number or email, and what you did for them, and tick that they agreed to be called.",
  hours: "Please type the reply time in hours, from 1 to 720.",
  license_date: "Please choose a licence date that has not passed.",
};
