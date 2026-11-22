// Partner accreditation (Step 1): the shared partner application for suppliers, service providers and toll
// manufacturers. Pure rules and plain words, shared by the /partner-us pages, the server actions, Admin > Partners and
// the tests. The database (0031_partner_roles_applications.sql) enforces the same statuses, limits and access rules.

export const PARTNER_CATEGORIES = {
  supplier: {
    label: "Supplier", fil: "Supplier ng produkto",
    text: "You sell products (raw materials, packaging, goods for resale) that FLAME PH members buy, in bulk or through Group Orders.",
    stage: "Pilot: Best Offer open to accredited suppliers",
  },
  service_provider: {
    label: "Service provider", fil: "Nagbibigay ng serbisyo",
    text: "You offer services to MSMEs: logistics, printing, accounting, marketing, repairs, training and the like.",
    stage: "Application open",
  },
  toll_manufacturer: {
    label: "Toll manufacturer", fil: "Gumagawa ng produkto para sa iba",
    text: "You make products for other brands under their name (FLAME Signature), with your own plant and permits.",
    stage: "Application open",
  },
} as const;
export type PartnerCategory = keyof typeof PARTNER_CATEGORIES;
export const CATEGORY_KEYS = Object.keys(PARTNER_CATEGORIES) as PartnerCategory[];
export const isCategory = (v: unknown): v is PartnerCategory => typeof v === "string" && v in PARTNER_CATEGORIES;

export const STATUS = {
  draft: { label: "Draft (not sent yet)", tone: "info" },
  submitted: { label: "Sent, waiting for review", tone: "info" },
  needs_changes: { label: "Needs changes from you", tone: "warn" },
  approved: { label: "Accredited", tone: "ok" },
  rejected: { label: "Not approved", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "info" },
} as const;
export type PartnerStatus = keyof typeof STATUS;
/** The applicant can change the answers only in these. */
export const EDITABLE: PartnerStatus[] = ["draft", "needs_changes"];

export const REGISTRATION_TYPES = {
  dti: "DTI (sole proprietorship)",
  sec_corporation: "SEC (corporation)",
  sec_partnership: "SEC (partnership)",
  cda: "CDA (cooperative)",
  other: "Other registration",
} as const;

export const COVERAGE = {
  city: "My city or municipality only",
  province: "My whole province",
  region: "My whole region",
  national: "Nationwide",
} as const;

/** The five screens of the form. One group of questions per screen, so it is easy on a phone. */
export const STEPS = [
  { n: 1, key: "business", title: "Your business", fil: "Tungkol sa negosyo" },
  { n: 2, key: "contact", title: "Contact and area", fil: "Contact at sakop na lugar" },
  { n: 3, key: "details", title: "What you offer", fil: "Ano ang inyong iniaalok" },
  { n: 4, key: "documents", title: "Documents", fil: "Mga dokumento" },
  { n: 5, key: "review", title: "Check and send", fil: "Suriin at ipadala" },
] as const;
export const LAST_STEP = STEPS.length;

// ------------------------------------------------------------------------------------------------------------------
// Step 3: questions that differ by category. Stored in partner_applications.details.
// ------------------------------------------------------------------------------------------------------------------
export type DetailField = {
  name: string;
  label: string;
  help?: string;
  type: "text" | "textarea" | "select";
  options?: readonly string[];
  required?: boolean;
  /** Required (and shown) only when another answer has this value. */
  showIf?: { field: string; equals: string };
  max?: number;
};

const YES_NO = ["Yes", "No"] as const;

export const DETAIL_FIELDS: Record<PartnerCategory, DetailField[]> = {
  supplier: [
    { name: "products", label: "What products do you supply?", help: "Isulat ang mga pangunahing produkto, e.g. kraft paper bags, cooking oil 18L, frozen chicken.", type: "textarea", required: true, max: 1000 },
    { name: "supplier_type", label: "What kind of supplier are you?", type: "select", required: true, options: ["Maker of our own brand", "Authorized distributor", "Wholesaler", "Importer", "Farmer, fisherfolk or cooperative", "Reseller"] },
    { name: "brands", label: "Brands you carry (if any)", type: "text", max: 300 },
    { name: "monthly_capacity", label: "How much can you supply in a month?", help: "Halimbawa: 500 boxes, 2 tons, 1,000 packs.", type: "text", required: true, max: 200 },
    { name: "delivery", label: "How do buyers get the products?", type: "select", required: true, options: ["We deliver", "Pickup only", "Through courier", "Delivery or pickup"] },
    { name: "regulated", label: "Do your products need FDA registration?", help: "Food, drinks, food supplements, cosmetics, medicines and household chemicals usually need it.", type: "select", required: true, options: YES_NO },
    { name: "fda_lto_no", label: "FDA License to Operate (LTO) number", type: "text", required: true, showIf: { field: "regulated", equals: "Yes" }, max: 60 },
  ],
  service_provider: [
    { name: "services", label: "What services do you offer?", help: "Halimbawa: delivery within Metro Manila, label printing, bookkeeping, aircon repair.", type: "textarea", required: true, max: 1000 },
    { name: "years_operating", label: "How long have you been offering these services?", type: "select", required: true, options: ["Less than 1 year", "1 to 2 years", "3 to 5 years", "6 to 10 years", "More than 10 years"] },
    { name: "team_size", label: "How many people do the work?", type: "select", required: true, options: ["Just me", "2 to 5", "6 to 20", "21 to 50", "More than 50"] },
    { name: "licensed", label: "Does your service need a professional license or government accreditation?", help: "Halimbawa: PRC license (accountant, engineer), TESDA, DOLE, LTFRB.", type: "select", required: true, options: YES_NO },
    { name: "license_body", label: "Who issued it?", help: "e.g. PRC, TESDA, DOLE, LTFRB", type: "text", required: true, showIf: { field: "licensed", equals: "Yes" }, max: 120 },
    { name: "license_no", label: "License or accreditation number", type: "text", required: true, showIf: { field: "licensed", equals: "Yes" }, max: 60 },
    { name: "past_clients", label: "Past clients or projects (optional)", type: "textarea", max: 800 },
  ],
  toll_manufacturer: [
    { name: "products_made", label: "What products can you make for other brands?", help: "Halimbawa: sauces and condiments, soap and detergents, skincare, snacks.", type: "textarea", required: true, max: 1000 },
    { name: "plant_address", label: "Address of your manufacturing site", type: "text", required: true, max: 300 },
    { name: "fda_lto_no", label: "FDA License to Operate (LTO) number", help: "Kailangan ito para gumawa ng produkto para sa ibang brand.", type: "text", required: true, max: 60 },
    { name: "monthly_capacity", label: "How much can you produce in a month?", type: "text", required: true, max: 200 },
    { name: "moq", label: "Smallest order per batch (MOQ)", help: "Halimbawa: 500 bottles per flavor.", type: "text", required: true, max: 200 },
    { name: "formulation", label: "Can you develop a formula for a client?", type: "select", required: true, options: YES_NO },
    { name: "certifications", label: "Certifications (optional)", help: "e.g. GMP, HACCP, Halal, ISO 22000", type: "text", max: 300 },
  ],
};

export const shown = (f: DetailField, d: Record<string, string>) => !f.showIf || d[f.showIf.field] === f.showIf.equals;

// ------------------------------------------------------------------------------------------------------------------
// Step 4: documents. Stored encrypted in the private bucket (vetting_documents, purpose 'partner').
// ------------------------------------------------------------------------------------------------------------------
export const PARTNER_DOC_TYPES = {
  dti_sec: { label: "Business registration", help: "DTI Certificate of Business Name, SEC Certificate of Incorporation or Partnership, or CDA Certificate (cooperatives)." },
  mayors_permit: { label: "Mayor's or business permit", help: "Your current permit from your city or municipality." },
  bir: { label: "BIR Certificate of Registration (Form 2303)", help: "Shows your TIN and how you are registered for tax." },
  gov_id: { label: "Valid ID of the representative", help: "Any government ID with photo: UMID, driver's license, passport, PhilSys National ID, PRC ID." },
  fda: { label: "FDA License to Operate (LTO)", help: "Needed for food, drinks, cosmetics, medicines and household chemicals." },
  prc: { label: "Professional license or accreditation", help: "PRC ID or license, TESDA, DOLE or other accreditation." },
  certification: { label: "Certifications (optional)", help: "GMP, HACCP, Halal, ISO, organic, or awards." },
  other: { label: "Other supporting document (optional)", help: "Product list, company profile or price list." },
} as const;
export type PartnerDocType = keyof typeof PARTNER_DOC_TYPES;
export const PARTNER_DOC_KEYS = Object.keys(PARTNER_DOC_TYPES) as PartnerDocType[];
export const isPartnerDocType = (v: unknown): v is PartnerDocType => typeof v === "string" && v in PARTNER_DOC_TYPES;

/** Documents needed before the application can be sent, by category and answers. */
export function requiredDocs(category: PartnerCategory, details: Record<string, string>): PartnerDocType[] {
  const out: PartnerDocType[] = ["dti_sec", "mayors_permit", "bir", "gov_id"];
  if (category === "toll_manufacturer" || (category === "supplier" && details.regulated === "Yes")) out.push("fda");
  if (category === "service_provider" && details.licensed === "Yes") out.push("prc");
  return out;
}

/** Free plan limits (Supabase storage is 1 GB in total). The bucket itself refuses anything over 5 MB. */
export const STORAGE_CAP_BYTES = 5 * 1024 * 1024;
/** One upload must fit in a single request to the hosting (4.5 MB), so the form takes up to 4 MB per file. */
export const PARTNER_DOC_MAX_BYTES = 4 * 1024 * 1024;
export const MAX_DOCS_PER_APPLICATION = 10;
export const MAX_BYTES_PER_PARTNER = 50 * 1024 * 1024;
/** Photos are shrunk in the phone before upload to this many pixels on the long side. */
export const PHOTO_MAX_SIDE = 1600;

// ------------------------------------------------------------------------------------------------------------------
// Review: reasons a reviewer can give, which the applicant sees.
// ------------------------------------------------------------------------------------------------------------------
export const REASONS = {
  doc_missing: "A required document is missing or cannot be read",
  doc_expired: "A permit or license has expired",
  name_mismatch: "The business name does not match the documents",
  reg_unverified: "We could not verify the registration number",
  tin_mismatch: "The TIN does not match the BIR document",
  contact_unreachable: "We could not reach the contact person, email or phone",
  fda_missing: "An FDA license or product registration is needed",
  not_needed: "Members do not need these products or services right now",
  duplicate: "There is already an application or accreditation for this business",
  other: "Other reason (see the note)",
} as const;
export type ReasonKey = keyof typeof REASONS;
export const REASON_KEYS = Object.keys(REASONS) as ReasonKey[];
export const isReason = (v: unknown): v is ReasonKey => typeof v === "string" && v in REASONS;

// ------------------------------------------------------------------------------------------------------------------
// Privacy notice and declaration, ticked on the last screen. Version is stored with the application.
// ------------------------------------------------------------------------------------------------------------------
export const PARTNER_PRIVACY = {
  version: "1.0",
  points: [
    "We use your answers and documents only to check and accredit your business as a FLAME PH partner, and to contact you about it.",
    "Only the FLAME PH national review team (founder, admins and national reviewers) can open your documents and see your TIN. Every time a document or TIN is opened, it is logged.",
    "Chapter coordinators see only your business name, category, town and status, so they can recommend you. They never see your documents, contact details or TIN.",
    "Documents are encrypted before they are stored. Your TIN and documents are never shown on any public page.",
    "We keep them while you are accredited. If your application is not approved or you withdraw it, we delete the documents 1 year later.",
    "You can download, correct or delete your data at My account → Your data. Our Data Protection Officer is Mark Tomon.",
  ],
  tl: "Ginagamit lang namin ang inyong sagot at dokumento para suriin at i-accredit ang inyong negosyo. Ang national review team lang ang makakabukas ng dokumento at makakakita ng TIN. Hindi ito ilalabas sa publiko.",
} as const;

export const DECLARATION = {
  en: "I declare that the information and documents I gave are true, correct and current, and that I am authorized to apply for this business. I understand that false information is a reason to reject my application or end my accreditation.",
  tl: "Pinapatunayan kong totoo at tama ang lahat ng impormasyon at dokumento, at may pahintulot akong mag-apply para sa negosyong ito.",
} as const;

// ------------------------------------------------------------------------------------------------------------------
// Checks. Saving a draft checks formats only; sending checks that everything required is there.
// ------------------------------------------------------------------------------------------------------------------
export const tinDigits = (v: string) => v.replace(/[\s-]/g, "");
/** TIN: 9 digits, or 12 with the branch code (e.g. 123-456-789-000). */
export const validTin = (v: string) => /^\d{9}(\d{3})?$/.test(tinDigits(v));
/** The TIN as the applicant sees it after saving: only the last 3 digits. */
export const formatTinMasked = (last3?: string | null) => (last3 ? `•••-•••-${last3}` : "");
export const validEmail = (v: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(v);
/** Philippine mobile or landline, with or without +63. */
export const validPhone = (v: string) => /^(\+?63|0)?[\d\s()-]{7,15}$/.test(v.trim()) && v.replace(/\D/g, "").length >= 7;
export const validUrl = (v: string) => { try { const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); return /\./.test(u.hostname); } catch { return false; } };

export type AppRow = {
  id: string; category: PartnerCategory; status: PartnerStatus; revision: number;
  legal_name: string | null; trade_name: string | null; registration_type: string | null; registration_no: string | null;
  tin_last3: string | null; industry: string | null; website: string | null;
  rep_name: string | null; rep_position: string | null; biz_email: string | null; biz_phone: string | null;
  address_line: string | null; city: string | null; province: string | null; coverage: string | null; coverage_areas: string | null;
  details: Record<string, string>; privacy_ack_at: string | null; declaration_at: string | null;
  submitted_at: string | null; decided_at: string | null; decision_reasons: string[]; decision_note: string | null;
  created_at: string; updated_at: string;
};

export type Missing = { step: number; what: string };

/** What still needs an answer before sending, with the screen to fix it on. Documents are counted by type. */
export function missingItems(a: Pick<AppRow, "category" | "legal_name" | "registration_type" | "registration_no" | "tin_last3" | "rep_name" | "biz_email" | "biz_phone" | "city" | "province" | "coverage" | "details">, docTypes: string[]): Missing[] {
  const out: Missing[] = [];
  const need = (v: unknown, step: number, what: string) => { if (v === null || v === undefined || String(v).trim() === "") out.push({ step, what }); };
  need(a.legal_name, 1, "Registered business name");
  need(a.registration_type, 1, "Type of registration");
  need(a.registration_no, 1, "Registration number");
  need(a.tin_last3, 1, "TIN");
  need(a.rep_name, 2, "Name of the representative");
  need(a.biz_email, 2, "Business email");
  need(a.biz_phone, 2, "Business phone");
  need(a.city, 2, "City or municipality");
  need(a.province, 2, "Province");
  need(a.coverage, 2, "Area you can serve");
  const d = a.details ?? {};
  for (const f of DETAIL_FIELDS[a.category]) if (f.required && shown(f, d)) need(d[f.name], 3, f.label);
  const have = new Set(docTypes);
  for (const t of requiredDocs(a.category, d)) if (!have.has(t)) out.push({ step: 4, what: PARTNER_DOC_TYPES[t].label });
  return out;
}

/** Only the category's own answers, trimmed and cut to length; hidden conditional answers are dropped. */
export function cleanDetails(category: PartnerCategory, input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of DETAIL_FIELDS[category]) {
    const v = typeof input[f.name] === "string" ? (input[f.name] as string).trim().slice(0, f.max ?? 300) : "";
    if (!v) continue;
    if (f.type === "select" && !(f.options ?? []).includes(v)) continue;
    out[f.name] = v;
  }
  for (const f of DETAIL_FIELDS[category]) if (!shown(f, out)) delete out[f.name];
  return out;
}

export const PARTNER_ERRORS: Record<string, string> = {
  email: "Please check the business email. Example: sales@yourbusiness.ph",
  phone: "Please check the phone number. Example: 0917 123 4567",
  website: "Please check the website or page link. Example: www.yourbusiness.ph",
  tin: "Please check the TIN: 9 digits, or 12 with the branch code. Example: 123-456-789-000",
  locked: "This application was already sent, so it can't be changed now. If it needs changes, the review team will open it for you.",
  missing: "Some answers or documents are still missing. See the list below.",
  boxes: "Please tick both boxes: the privacy notice and the declaration.",
  doc_type: "Choose which document this is.",
  empty: "Please choose a file.",
  size: "The file is too big. The limit is 4 MB per file. Take a photo instead (the page makes photos smaller), or save the PDF smaller.",
  format: "Please upload a PDF, JPG, PNG or WEBP file.",
  too_many: `An application can have up to ${MAX_DOCS_PER_APPLICATION} files. Delete one first.`,
  total: "Your partner files have reached 50 MB in total. Delete an old file first.",
  unavailable: "Partner applications open after FLAME PH finishes a database update. Please try again later.",
  failed: "That didn't go through. Please try again.",
};

export const PARTNER_DONE: Record<string, string> = {
  saved: "Saved. You can close this page and continue anytime.",
  uploaded: "File received. It is encrypted and only the national review team can open it.",
  deleted: "File deleted.",
  submitted: "Sent! The national review team will check your application. We will tell you in your Inbox and by email.",
  withdrawn: "Your application was withdrawn.",
  reopened: "Your application is open again as a draft. Fix what the review team pointed out, then send it again.",
};
