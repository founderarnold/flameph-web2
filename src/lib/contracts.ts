// Partner accreditation (Step 8): contract generation and sign-off. Pure rules and plain words for agreement templates,
// partner contracts, the legal check, signing (electronic under RA 8792, or a wet-ink signed copy) and renewal alerts.
// Used by Admin > Partners > Contracts, /partner-us/contracts, the copy download, the renewal alert and the tests.
// The database (0038_partner_contracts.sql) enforces the same parts, check items, order of signing and rules.
// No imports, so the tests can load it on its own.

/** The template parts, in the order they appear in a contract. */
export const PARTS = {
  master: { label: "Master Partner Agreement", short: "Master Agreement" },
  schedule_supplier: { label: "Schedule 1: Supplier terms", short: "Supplier schedule" },
  schedule_service: { label: "Schedule 1: Service provider terms", short: "Service schedule" },
  schedule_manufacturer: { label: "Schedule 1: Toll manufacturing and FLAME Signature terms", short: "Manufacturer schedule" },
  annex_territory: { label: "Annex A: Territory", short: "Territory annex" },
  annex_pricing: { label: "Annex B: Pricing and commission", short: "Pricing annex" },
  annex_sla: { label: "Annex C: Service levels, complaints and penalties", short: "Service level annex" },
  annex_ip: { label: "Annex D: Intellectual property, FLAME marks and confidentiality", short: "IP annex" },
} as const;
export type Part = keyof typeof PARTS;
export const PART_KEYS = Object.keys(PARTS) as Part[];
export const isPart = (v: unknown): v is Part => typeof v === "string" && v in PARTS;

export type ContractCategory = "supplier" | "service_provider" | "toll_manufacturer";
export const CONTRACT_CATEGORIES: Record<ContractCategory, string> = { supplier: "Supplier", service_provider: "Service provider", toll_manufacturer: "Toll manufacturer" };
export const isContractCategory = (v: unknown): v is ContractCategory => typeof v === "string" && v in CONTRACT_CATEGORIES;

/** The six parts every contract of this category needs (same as contract_required_parts() in the database). */
export function requiredParts(cat: ContractCategory): Part[] {
  const schedule: Part = cat === "service_provider" ? "schedule_service" : cat === "toll_manufacturer" ? "schedule_manufacturer" : "schedule_supplier";
  return ["master", schedule, "annex_territory", "annex_pricing", "annex_sla", "annex_ip"];
}

export const TEMPLATE_STATUS = {
  draft: { label: "Draft (not for use)", tone: "warn" },
  approved: { label: "In use (lawyer reviewed)", tone: "ok" },
  retired: { label: "Retired", tone: "info" },
} as const;
export type TemplateStatus = keyof typeof TEMPLATE_STATUS;

export const CONTRACT_STATUS = {
  draft: { label: "Draft", tone: "info", fil: "Draft pa" },
  out_for_signing: { label: "Waiting for the partner's signature", tone: "warn", fil: "Hinihintay ang pirma ng partner" },
  partner_signed: { label: "Partner signed; waiting for FLAME's signature", tone: "warn", fil: "Pumirma na ang partner" },
  signed: { label: "Signed by both sides", tone: "ok", fil: "Pirmado ng dalawang panig" },
  ended: { label: "Ended", tone: "info", fil: "Natapos na" },
  terminated: { label: "Terminated", tone: "danger", fil: "Tinapos dahil sa paglabag" },
  cancelled: { label: "Cancelled (never signed)", tone: "info", fil: "Kinansela" },
} as const;
export type ContractStatus = keyof typeof CONTRACT_STATUS;

/** The legal check. Every item must be ticked to clear a version (same keys as contract_check_items()). */
export const CHECK_ITEMS = {
  parties_authority: "The parties are right: the partner's legal name, registration and address, and the signatory's authority (resolution, certificate or SPA) is on file.",
  schedule_offer: "Schedule 1 and the pricing match the chosen Best Offer (or FLAME Signature licence).",
  territory: "Annex A matches the territorial appointments: areas, channels, exclusivity and dates.",
  pricing_commission: "The commission split is the one agreed, written as a recorded figure (no money passes through flameph.org).",
  sla_penalties: "Service levels, complaint targets and the proposed penalties are right, and penalties were reviewed by a lawyer.",
  ip_confidentiality: "Intellectual property, use of the FLAME marks and confidentiality fit this partner.",
  dates_renewal: "The effective date, end date and renewal notice are right. Nothing renews by itself.",
  templates_lawyer: "Every template part used was reviewed by a lawyer (shown on the Templates page).",
} as const;
export type CheckItem = keyof typeof CHECK_ITEMS;
export const CHECK_KEYS = Object.keys(CHECK_ITEMS) as CheckItem[];
export const canClear = (ticked: string[]) => CHECK_KEYS.every((k) => ticked.includes(k));

export const AUTHORITY = {
  sole_proprietor: "Owner of a sole proprietorship (signs personally)",
  board_resolution: "Board resolution (corporation or cooperative)",
  secretary_certificate: "Secretary's certificate",
  partnership_resolution: "Partners' resolution (partnership)",
  special_power_of_attorney: "Special power of attorney (SPA)",
  other: "Other written authority",
} as const;
export type Authority = keyof typeof AUTHORITY;
export const isAuthority = (v: unknown): v is Authority => typeof v === "string" && v in AUTHORITY;

export const REG_TYPES = {
  dti: "DTI business name registration",
  sec_corporation: "SEC registration (corporation)",
  sec_partnership: "SEC registration (partnership)",
  cda: "CDA registration (cooperative)",
  other: "Registration",
} as const;
export type RegType = keyof typeof REG_TYPES;
export const isRegType = (v: unknown): v is RegType => typeof v === "string" && v in REG_TYPES;

export const CONTRACT_FILE_TYPES = {
  signed_contract: "Signed copy of the contract (wet ink, scanned)",
  authority_proof: "Proof of the signatory's authority (board resolution, secretary's certificate, SPA)",
  other: "Other contract file",
} as const;
export type ContractFileType = keyof typeof CONTRACT_FILE_TYPES;
export const isContractFileType = (v: unknown): v is ContractFileType => typeof v === "string" && v in CONTRACT_FILE_TYPES;
export const MAX_CONTRACT_FILES = 6;

// ------------------------------------------------------------------------------------------------------------------
// The parties. Commercial contracting and all money are with MarketplacePH Online Store (the Operator); FLAME PH is the
// accrediting community. Same wording as the Terms of Use.
// ------------------------------------------------------------------------------------------------------------------
export const OPERATOR = {
  name: "MarketplacePH Online Store",
  details: "a DTI-registered business with address at Princeton St., Naga City, Camarines Sur, the Operator of flameph.org, marketplaceph.com and negosyodepot.com",
} as const;
export const FLAME_PARTY = "FLAME PH, formerly FAME Inc., SEC Reg. No. 2024050150009-15";
export const VENUE = "the proper courts of San Fernando City, Pampanga";

// ------------------------------------------------------------------------------------------------------------------
// Placeholders: {{key}} in a template is replaced by the contract's own data. The blocks are written by the server
// from what is on record (offer, territories, licence, commission, penalty terms, service levels).
// ------------------------------------------------------------------------------------------------------------------
export const PLACEHOLDERS = {
  contract_no: "Contract number (PC-00001)",
  revision: "Version of this contract",
  operator_name: "MarketplacePH Online Store",
  operator_details: "The Operator's registration and address",
  flame_party: "FLAME PH and its SEC number",
  partner_legal_name: "The partner's legal name",
  partner_registration: "The partner's registration (type and number)",
  partner_address: "The partner's business address",
  partner_category: "Supplier, service provider or toll manufacturer",
  partner_signatory: "The partner's signatory",
  partner_signatory_position: "The signatory's position",
  partner_authority: "The signatory's authority",
  flame_signatory: "FLAME's signatory",
  flame_signatory_position: "FLAME's signatory's position",
  effective_date: "Start date",
  end_date: "End date",
  renewal_notice_days: "Days of notice before the end date",
  offer_block: "Products, services or FLAME Signature products with prices (from the chosen offer)",
  territory_block: "Territorial appointments (areas, channels, exclusivity, dates)",
  commission_block: "The commission split (recorded figures)",
  penalty_block: "The proposed late-delivery penalty",
  sla_block: "Lead time, response and complaint targets",
  licence_block: "The FLAME Signature licence (manufacturers)",
  special_terms: "Special terms typed for this contract",
  money_notice: "The money notice in English and Taglish",
  venue: "Courts for disputes",
} as const;
export type Placeholder = keyof typeof PLACEHOLDERS;
export const PLACEHOLDER_KEYS = Object.keys(PLACEHOLDERS) as Placeholder[];
const TAG = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** The placeholders a template uses that the site does not know (shown as a warning before approval). */
export function unknownPlaceholders(body: string): string[] {
  return [...new Set([...body.matchAll(TAG)].map((m) => m[1]).filter((k) => !(k in PLACEHOLDERS)))];
}

/** Fills {{key}} with the values; anything missing becomes "[not filled in: label]" so nothing is silently blank. */
export function fillTemplate(body: string, values: Partial<Record<Placeholder, string>>): string {
  return body.replace(TAG, (_m, k: string) => {
    const v = (values as Record<string, string | undefined>)[k];
    if (v !== undefined && v.trim() !== "") return v;
    return `[not filled in: ${(PLACEHOLDERS as Record<string, string>)[k] ?? k}]`;
  });
}

/** Lines in a filled text that still say "[not filled in: …]". Sending is blocked while any remain. */
export const missingInText = (text: string) => [...new Set([...text.matchAll(/\[not filled in: ([^\]]+)\]/g)].map((m) => m[1]))];

export type TemplatePart = { part: Part; version: string; title: string; body: string };

/** The full contract text: a cover with the parts and versions used, then each part in order. CRLF and trailing
 *  spaces are cleaned so the fingerprint does not depend on the device. */
export function assembleContract(ref: string, revision: number, parts: TemplatePart[], values: Partial<Record<Placeholder, string>>): string {
  const order = PART_KEYS;
  const sorted = [...parts].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));
  const cover = [
    `CONTRACT ${ref} (version ${revision})`,
    "",
    "This contract is made of the following parts. If they conflict, the Master Partner Agreement prevails over Schedule 1, and Schedule 1 over the Annexes, unless an Annex says it overrides a numbered clause.",
    ...sorted.map((p) => `- ${PARTS[p.part].label}: ${p.title} (template version ${p.version})`),
  ].join("\n");
  const body = sorted.map((p) => `${"=".repeat(60)}\n${PARTS[p.part].label.toUpperCase()}\n${"=".repeat(60)}\n\n${fillTemplate(p.body, values).trim()}`).join("\n\n");
  return normalizeText(`${cover}\n\n${body}\n`);
}
export const normalizeText = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{4,}/g, "\n\n\n");

/** Names are compared the way the database does: trimmed, single spaces, any case. */
export const normName = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const nameMatches = (typed: string, expected: string | null | undefined) => normName(typed).length >= 3 && normName(typed) === normName(expected);

/** Short form of a fingerprint for people: first and last 8 characters. */
export const shortHash = (h: string | null | undefined) => (h && h.length === 64 ? `${h.slice(0, 8)}…${h.slice(-8)}` : "—");

// ------------------------------------------------------------------------------------------------------------------
// Electronic signing (RA 8792, Electronic Commerce Act). Off until a lawyer reviews this flow and the founder records it.
// ------------------------------------------------------------------------------------------------------------------
export const ESIGN_CONSENT = {
  en: "I agree to sign this contract electronically. I understand that under the Electronic Commerce Act (Republic Act No. 8792) my electronic signature has the same legal effect as my handwritten signature, and that the site keeps the exact text I signed (its fingerprint), the time, my account, my IP address and my browser as the record of my signature.",
  tl: "Pumapayag akong pumirma nang electronic. Naiintindihan ko na sa ilalim ng RA 8792, ang electronic na pirma ko ay may parehong bisa ng pirma ko sa papel, at itatala ng site ang eksaktong teksto, oras, account, IP address at browser bilang patunay.",
} as const;
export const AUTHORITY_CONFIRM = (name: string, position: string, business: string) =>
  `I am ${name}, ${position} of ${business}, and I am authorized to sign this contract for ${business}.`;
export const NOT_LEGAL_ADVICE = "These templates are plain-language drafts prepared for FLAME PH. They are not legal advice. A lawyer must review each version (and the electronic signing flow) before it is used.";

// ------------------------------------------------------------------------------------------------------------------
// Renewal: alerts start renewal_notice_days before the end date. Nothing renews by itself.
// ------------------------------------------------------------------------------------------------------------------
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
export function renewalState(c: { status: string; end_date: string | null; renewal_notice_days: number }, today: string): "none" | "due" | "expired" {
  if (c.status !== "signed" || !c.end_date) return "none";
  const left = dayNum(c.end_date) - dayNum(today);
  if (left < 0) return "expired";
  return left <= c.renewal_notice_days ? "due" : "none";
}
export const daysLeft = (end: string, today: string) => dayNum(end) - dayNum(today);
/** The same dates, moved forward for a renewal: starts the day after the old end, same length. */
export function renewalDates(start: string | null, end: string): { effective_date: string; end_date: string } {
  const s = start ? dayNum(start) : dayNum(end) - 365;
  const len = Math.max(30, dayNum(end) - s);
  const ns = dayNum(end) + 1;
  const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  return { effective_date: iso(ns), end_date: iso(ns + len) };
}

export type ContractRow = {
  id: string; ref_no: string; partner_user_id: string | null; partner_name: string; category: ContractCategory; offer_id: string | null;
  licence_id: string | null; appointment_ids: string[]; renews_id: string | null; party_reg_type: RegType | null; party_reg_no: string | null;
  party_address: string | null; signatory_name: string | null; signatory_position: string | null; signatory_authority: Authority | null;
  authority_ref: string | null; signatory_email: string | null; flame_signatory_name: string | null; flame_signatory_position: string | null;
  effective_date: string | null; end_date: string | null; renewal_notice_days: number; national_pct: number | null; regional_pct: number | null;
  provincial_pct: number | null; city_pct: number | null; late_rate_pct_per_day: number | null; late_cap_pct: number | null;
  special_terms: string | null; status: ContractStatus; revision: number; template_ids: string[]; body: string | null; body_sha256: string | null;
  sent_at: string | null; first_sent_at: string | null; partner_signed_at: string | null; signed_at: string | null; ended_at: string | null;
  status_reason: string | null; renewal_alerted_at: string | null; created_at: string; updated_at: string;
};
export const CONTRACT_COLS = "id, ref_no, partner_user_id, partner_name, category, offer_id, licence_id, appointment_ids, renews_id, party_reg_type, party_reg_no, party_address, signatory_name, signatory_position, signatory_authority, authority_ref, signatory_email, flame_signatory_name, flame_signatory_position, effective_date, end_date, renewal_notice_days, national_pct, regional_pct, provincial_pct, city_pct, late_rate_pct_per_day, late_cap_pct, special_terms, status, revision, template_ids, body, body_sha256, sent_at, first_sent_at, partner_signed_at, signed_at, ended_at, status_reason, renewal_alerted_at, created_at, updated_at";
export const CONTRACT_LIST_COLS = "id, ref_no, partner_name, category, status, revision, effective_date, end_date, renewal_notice_days, signed_at, sent_at, updated_at";

export type SignatureRow = {
  id: string; revision: number; side: "partner" | "flame"; method: "electronic" | "wet_ink"; signer_name: string; signer_position: string;
  typed_name: string | null; body_sha256: string; signed_on: string | null; signed_at: string;
};
export const SIGNATURE_COLS = "id, revision, side, method, signer_name, signer_position, typed_name, body_sha256, signed_on, signed_at";

/** What still has to be filled in on a draft before the legal check and sending (plain words). */
export function contractMissing(c: Pick<ContractRow, "party_reg_type" | "party_reg_no" | "party_address" | "signatory_name" | "signatory_position"
  | "signatory_authority" | "authority_ref" | "flame_signatory_name" | "flame_signatory_position" | "effective_date" | "end_date" | "category" | "offer_id" | "licence_id">): string[] {
  const out: string[] = [];
  if (!c.party_reg_type || !c.party_reg_no) out.push("the partner's registration type and number");
  if (!c.party_address) out.push("the partner's business address");
  if (!c.signatory_name || !c.signatory_position) out.push("the partner's signatory and position");
  if (!c.signatory_authority) out.push("the signatory's authority");
  else if (c.signatory_authority !== "sole_proprietor" && !c.authority_ref) out.push("the reference of the signatory's authority (resolution, certificate or SPA)");
  if (!c.flame_signatory_name || !c.flame_signatory_position) out.push("FLAME's signatory and position");
  if (!c.effective_date || !c.end_date) out.push("the start and end dates");
  else if (c.end_date <= c.effective_date) out.push("an end date after the start date");
  if (!c.offer_id && c.category !== "toll_manufacturer") out.push("the chosen Best Offer");
  if (c.category === "toll_manufacturer" && !c.licence_id && !c.offer_id) out.push("the FLAME Signature licence or proposal");
  return out;
}

export const CONTRACT_ERRORS: Record<string, string> = {
  failed: "That didn't go through. Please try again.",
  missing: "That contract was not found.",
  own: "You can't work on a contract with your own business.",
  partner: "Choose an accredited partner and a category they are accredited in.",
  dates: "Check the dates: the end date must be after the start date, at most 5 years later.",
  split: "Fill in all four commission levels (or leave all four empty). The total must be 50% or less.",
  penalty: "Fill in both the daily rate and the cap (or leave both empty); the cap must be at least the daily rate.",
  check_items: "To clear the legal check, every item must be ticked. Otherwise choose \"Not cleared\" and say what must change.",
  check_note: "Write a short note on the legal check.",
  not_ready: "Fill in everything listed under \"Still missing\" first.",
  templates: "Every part of this contract needs a template version that a lawyer reviewed and the team approved (Templates page).",
  unfilled: "The contract text still has parts that are not filled in. Fix them before sending.",
  reason: "Please give the reason.",
  move: "That step is not possible now.",
  esign_off: "Electronic signing is off until a lawyer reviews it. Sign on paper; the team will upload the signed copy.",
  name: "Type the signatory's full name exactly as written in the contract.",
  consent: "Tick both boxes to sign.",
  changed: "The contract changed since you opened it. Please read the new version.",
  founder: "Only the founder signs for FLAME.",
  file: "Upload the signed copy first (PDF or photo, up to 4 MB).",
  doc_type: "Choose what kind of file this is.",
  empty: "Choose a file to upload.",
  size: "That file is bigger than 4 MB.",
  format: "Upload a PDF, JPG, PNG or WEBP file.",
  too_many: `Up to ${MAX_CONTRACT_FILES} files per contract.`,
  signed_on: "Write the date on the signed paper (between sending and today).",
  lawyer: "Write the lawyer's name and the date of the review (not in the future).",
  esign_lawyer: "Write the lawyer's name and the date they reviewed the electronic signing flow.",
  template_text: "Write the template text (at least 50 characters) and a title.",
  version: "Write the version like 1.0 or 1.1, and use a number not used before for this part.",
  placeholders: "The template uses unknown placeholders. Use only the ones listed.",
  sanction: "To terminate, first approve a termination sanction in Sanctions. Otherwise end the contract.",
  renewal: "Only a signed or ended contract can be renewed.",
  rate: "The agreement rate or penalty terms could not be started. They may already exist.",
  unavailable: "Contracts are not available yet. Please try again later.",
};

export const CONTRACT_DONE: Record<string, string> = {
  created: "Draft contract made. Fill in the details, then do the legal check.",
  saved: "Saved.",
  checked: "Legal check saved.",
  sent: "Sent to the partner for signing. They were told by notice and email.",
  returned: "Taken back to draft as a new version.",
  changes_asked: "Your request was sent. The team will prepare a new version.",
  signed_partner: "Thank you. You signed the contract. FLAME's signatory signs next; you will be told.",
  signed_flame: "Signed. The contract is now signed by both sides.",
  wet_ink: "Wet-ink signature recorded.",
  status: "Status saved.",
  uploaded: "File uploaded and encrypted.",
  deleted: "File removed.",
  note: "Note saved (team only).",
  renewal: "Renewal draft made from this contract.",
  rate: "Draft agreement rate made from this contract. It still needs approval in Commissions.",
  penalty: "Draft penalty terms made from this contract. They still need a second person's approval in Complaints > Settings.",
  template_saved: "Template saved as a draft.",
  template_approved: "Template version approved. New contracts use it from now on.",
  template_retired: "Template version retired.",
  template_deleted: "Draft template deleted.",
  loaded: "Standard drafts loaded as version 1.0 drafts. Have a lawyer review them before approving.",
  esign: "Electronic signing setting saved.",
};
