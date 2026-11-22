// Partner accreditation, Step 3: territories and appointments. Labels, plain-language help (English with Taglish),
// and small pure helpers shared by the admin pages, the partner page and the tests. The database (0033) enforces the
// same rules again: national team only, overlap check, sub-partners inside the main territory, locked after approval.
// No imports, so the tests can load this file on its own.

export const PARTNER_KINDS = {
  supplier: "Supplier",
  service_provider: "Service provider",
  toll_manufacturer: "Toll manufacturer",
} as const;
export type PartnerKind = keyof typeof PARTNER_KINDS;

export const RIGHTS = {
  distribution: { label: "Selling and distribution", help: "The partner sells or delivers this category to members in the area." },
  manufacturing: { label: "Manufacturing", help: "The partner makes the products for FLAME PH (toll manufacturing). Kept apart from selling rights." },
} as const;
export type Rights = keyof typeof RIGHTS;

export const EXCLUSIVITY = {
  non_exclusive: { label: "Non-exclusive", help: "Other partners may also be appointed for the same category in this area.", fil: "Puwedeng may ibang partner din sa lugar na ito." },
  exclusive: { label: "Exclusive", help: "No other partner gets the same category, channels and dates in this area, unless the national team approves an overlap in writing.", fil: "Siya lang ang partner para dito sa lugar na ito." },
} as const;
export type Exclusivity = keyof typeof EXCLUSIVITY;

/** Where the partner may sell under this appointment. */
export const CHANNELS = {
  group_order: { label: "FLAME PH Group Orders", fil: "Group Order ng mga member" },
  chapter_events: { label: "Chapter events and meetups", fil: "Mga event at meetup ng chapter" },
  direct_members: { label: "Direct sales to member businesses", fil: "Direktang benta sa mga member" },
  marketplaceph: { label: "MarketplacePH Online Store", fil: "MarketplacePH Online Store" },
  negosyodepot: { label: "NegosyoDepot", fil: "NegosyoDepot" },
  own_online: { label: "Partner's own website or social media shop", fil: "Sariling website o online shop" },
  own_store: { label: "Partner's own store or outlet", fil: "Sariling tindahan o outlet" },
  resellers: { label: "Resellers and sub-partners", fil: "Mga reseller at sub-partner" },
} as const;
export type Channel = keyof typeof CHANNELS;
export const CHANNEL_KEYS = Object.keys(CHANNELS) as Channel[];

/** How online orders are handled for this territory. */
export const ONLINE_SALES = {
  delivery_address: { label: "Online orders count for this territory when the delivery address is inside it", fil: "Kasama ang online order kapag ang delivery ay nasa loob ng lugar." },
  national_online: { label: "Online orders are handled nationally by MarketplacePH Online Store and are not part of this territory", fil: "Ang online order ay hawak ng MarketplacePH Online Store, hindi kasama sa lugar na ito." },
  open: { label: "Online selling is open to all partners; this territory gives no online rights", fil: "Bukas sa lahat ang online selling; walang online rights ang lugar na ito." },
} as const;
export type OnlineSales = keyof typeof ONLINE_SALES;

export const TERRITORY_STATUS = {
  draft: { label: "Draft (team only)", tone: "info" },
  active: { label: "Active", tone: "ok" },
  suspended: { label: "Suspended", tone: "warn" },
  ended: { label: "Ended", tone: "danger" },
  cancelled: { label: "Cancelled draft", tone: "danger" },
} as const;
export type TerritoryStatus = keyof typeof TERRITORY_STATUS;

export const TARGET_PERIOD = { monthly: "per month", quarterly: "per quarter", yearly: "per year" } as const;
export type TargetPeriod = keyof typeof TARGET_PERIOD;

export const REVIEW_EVERY = {
  monthly: { label: "Every month", months: 1 },
  quarterly: { label: "Every 3 months", months: 3 },
  semiannual: { label: "Every 6 months", months: 6 },
  yearly: { label: "Every year", months: 12 },
} as const;
export type ReviewEvery = keyof typeof REVIEW_EVERY;

export const RATINGS = {
  exceeds: "Above target",
  meets: "On target",
  below: "Below target",
  far_below: "Far below target",
} as const;
export type Rating = keyof typeof RATINGS;

export const OUTCOMES = {
  continue: "Continue as is",
  improvement_plan: "Continue with an improvement plan",
  reduce_area: "Reduce the area at renewal",
  remove_exclusivity: "Make it non-exclusive at renewal",
  end: "End the appointment",
} as const;
export type Outcome = keyof typeof OUTCOMES;

export const AREA_LEVELS = {
  national: "Whole Philippines",
  region: "Region",
  province: "Province",
  city: "City or municipality",
} as const;
export type AreaLevel = keyof typeof AREA_LEVELS;

export const NOMINATION_STATUS = {
  submitted: { label: "Waiting for the national team", tone: "info" },
  accepted: { label: "Accepted for review", tone: "ok" },
  declined: { label: "Not accepted", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "warn" },
} as const;
export type NominationStatus = keyof typeof NOMINATION_STATUS;

export const MAX_AREAS = 60;
export const MAX_EXCLUDED = 30;
export const MAX_OPEN_NOMINATIONS = 10;

/** Shown wherever targets appear: targets are goals for the review, never promised sales, payments or commissions. */
export const TARGET_NOTE = {
  en: "Targets are goals used in the performance review. They are not promised sales, payments or commissions.",
  tl: "Ang target ay layunin para sa performance review. Hindi ito pangakong benta, bayad o commission.",
} as const;

/** The rule of the whole step, in plain words. */
export const APPOINT_RULE = {
  en: "Only the FLAME PH national team appoints partners to an area. A partner can nominate a sub-partner inside their own area, but cannot appoint anyone.",
  tl: "Ang national team lang ng FLAME PH ang nag-a-appoint ng partner sa isang lugar. Puwedeng mag-nominate ng sub-partner ang partner sa loob ng sariling lugar, pero hindi siya puwedeng mag-appoint.",
} as const;

/** A short code for the category, so the same category always compares equal ("other:rice-milling"). */
export function slug(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

/** The category of an appointment: a known product group, or a named category ("Other" products or a service). */
export function categoryFrom(group: string | null, name: string | null, groups: Record<string, string>, kind: PartnerKind): { key: string; label: string } | null {
  const typed = (name ?? "").trim().replace(/\s+/g, " ").slice(0, 150);
  if (kind !== "service_provider" && group && group !== "other" && group in groups) return { key: group, label: groups[group] };
  const s = slug(typed);
  if (typed.length < 2 || s.length < 2) return null;
  return { key: `${kind === "service_provider" ? "service" : "other"}:${s}`, label: typed };
}

/** Excluded accounts typed one per line (or separated by semicolons): trimmed, no blanks, no repeats, at most 30. */
export function parseExcluded(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[\n;]+/)) {
    const v = raw.trim().replace(/\s+/g, " ").slice(0, 150);
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
    if (out.length >= MAX_EXCLUDED) break;
  }
  return out;
}

export type AreaCodes = { region_code: string | null; province_code: string | null; city_code: string | null };
/** True when area a contains area b (same or wider). Same rule as public.territory_area_covers in 0033. */
export const covers = (a: AreaCodes, b: AreaCodes) =>
  (a.region_code === null || a.region_code === b.region_code) && (a.province_code === null || a.province_code === b.province_code) && (a.city_code === null || a.city_code === b.city_code);
export const areasOverlap = (a: AreaCodes, b: AreaCodes) => covers(a, b) || covers(b, a);

export type ScopeRow = {
  id: string; partner_user_id: string; parent_id: string | null; rights: string; category_key: string; exclusivity: string;
  channels: string[]; start_date: string | null; end_date: string | null; status: string; areas: AreaCodes[];
};
const rangesOverlap = (a: ScopeRow, b: ScopeRow) => (a.start_date ?? "0000") <= (b.end_date ?? "9999") && (b.start_date ?? "0000") <= (a.end_date ?? "9999");
/** Same rule as public.territory_conflicts in 0033: two partners, same rights and category, overlapping dates, a shared
 *  channel and an overlapping area, where at least one is exclusive (a sub-partner never conflicts with its main). */
export function conflicts(a: ScopeRow, b: ScopeRow) {
  if (a.id === b.id || !["active", "suspended"].includes(b.status) || a.partner_user_id === b.partner_user_id) return false;
  if (a.rights !== b.rights || a.category_key !== b.category_key) return false;
  if (a.exclusivity !== "exclusive" && b.exclusivity !== "exclusive") return false;
  if (!rangesOverlap(a, b)) return false;
  if (a.channels.length > 0 && !a.channels.some((c) => b.channels.includes(c))) return false;
  if (b.id === a.parent_id || b.parent_id === a.id) return false;
  return a.areas.some((x) => b.areas.some((y) => areasOverlap(x, y)));
}

/** "2026-11-23" plus some months, as a date string (the 31st becomes the last day of a shorter month). */
export function addMonths(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** Today's date in Manila, "YYYY-MM-DD". */
export const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** What a member reads: an active appointment past its end date shows as expired, one not started yet as upcoming. */
export function shownStatus(row: { status: string; start_date: string | null; end_date: string | null }, today = manilaToday()) {
  if (row.status === "active" && row.end_date && row.end_date < today) return { key: "expired", label: "Expired (end date passed)", tone: "warn" as const };
  if (row.status === "active" && row.start_date && row.start_date > today) return { key: "upcoming", label: "Approved, starts soon", tone: "info" as const };
  const s = TERRITORY_STATUS[row.status as TerritoryStatus] ?? TERRITORY_STATUS.draft;
  return { key: row.status, label: s.label, tone: s.tone };
}

/** A review is due when the next review date is today or earlier. */
export const reviewDue = (row: { status: string; next_review_date: string | null }, today = manilaToday()) =>
  ["active", "suspended"].includes(row.status) && !!row.next_review_date && row.next_review_date <= today;

/** "₱1,200,000" (figures only; nothing on flameph.org is a payment). */
export const php = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : `₱${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

/** Money typed by the team: digits, commas and one dot; empty is allowed. Returns undefined when it is not a number. */
export function parseAmount(v: unknown): number | null | undefined {
  const s = String(v ?? "").replace(/[₱,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) return undefined;
  return Number(s);
}
export function parseWhole(v: unknown, max = 1_000_000): number | null | undefined {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,7}$/.test(s) || Number(s) > max) return undefined;
  return Number(s);
}
export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** The database's own words for a refused change (0033 raises "territory: …"), cleaned up for the team. */
export function dbReason(message: string | null | undefined) {
  const m = String(message ?? "").match(/territory(?:_area|_review|_nomination)?: (.{3,300})/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
