// Partner accreditation, Step 4: commission rates and the commission ledger. Labels, plain-language help (English with
// Taglish), and the same arithmetic the database uses (0034), so the simulator and the tests match the ledger to the
// centavo. No imports, so the tests can load this file on its own.
//
// MONEY RULE: flameph.org never collects, holds, pays out or moves money. These are records of what MarketplacePH
// Online Store collected and paid. Nothing is paid automatically.

export const LEVELS = [
  { key: "national", label: "National", help: "FLAME PH National", fil: "Pambansa" },
  { key: "regional", label: "Regional", help: "The regional chapter of the place of delivery", fil: "Rehiyon" },
  { key: "provincial", label: "Provincial", help: "The provincial chapter", fil: "Probinsya" },
  { key: "city", label: "City or municipal", help: "The city or town chapter; it also takes the rounding of centavos", fil: "Lungsod o bayan" },
] as const;
export type Level = (typeof LEVELS)[number]["key"];
export const LEVEL_LABEL: Record<Level, string> = { national: "National", regional: "Regional", provincial: "Provincial", city: "City or municipal" };

export const CATEGORIES = { supplier: "Supplier", service_provider: "Service provider", toll_manufacturer: "Toll manufacturer" } as const;
export type Category = keyof typeof CATEGORIES;

export type Split = { national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number };
/** The program's starting targets (FLAME_PH_Partner_Prompts_v2, Step 4), the same as the rows 0034 seeds. */
export const DEFAULT_TARGETS: Record<Category, Split> = {
  supplier: { national_pct: 1, regional_pct: 1, provincial_pct: 1, city_pct: 2 },
  service_provider: { national_pct: 3, regional_pct: 2, provincial_pct: 3, city_pct: 4 },
  toll_manufacturer: { national_pct: 2, regional_pct: 1, provincial_pct: 2, city_pct: 3 },
};
/** A rate row from the database (numbers may arrive as text) as a Split. */
export const toSplit = (r: { national_pct: unknown; regional_pct: unknown; provincial_pct: unknown; city_pct: unknown }): Split =>
  ({ national_pct: Number(r.national_pct), regional_pct: Number(r.regional_pct), provincial_pct: Number(r.provincial_pct), city_pct: Number(r.city_pct) });
export const totalPct = (s: Split) => Math.round((s.national_pct + s.regional_pct + s.provincial_pct + s.city_pct) * 100) / 100;
export const MAX_LEVEL_PCT = 30;
export const MAX_TOTAL_PCT = 50;
export const MAX_WITHHOLDING_PCT = 25;

export const RULE_STATUS = {
  draft: { label: "Draft (waiting for a second person)", tone: "info" },
  active: { label: "In use", tone: "ok" },
  retired: { label: "Retired (still applies to its own dates)", tone: "warn" },
  cancelled: { label: "Cancelled draft", tone: "danger" },
} as const;
export type RuleStatus = keyof typeof RULE_STATUS;

export const ENTRY_STATUS = {
  recorded: { label: "Recorded, waiting for approval", tone: "info" },
  approved: { label: "Approved (counted)", tone: "ok" },
  not_eligible: { label: "Not eligible (not counted)", tone: "warn" },
  void: { label: "Void (recorded by mistake)", tone: "danger" },
} as const;
export type EntryStatus = keyof typeof ENTRY_STATUS;

export const PAYOUT_STATUS = {
  open: { label: "Not yet in a payout", tone: "info" },
  draft: { label: "In a payout being prepared", tone: "info" },
  approved: { label: "Payout approved, waiting for MarketplacePH Online Store", tone: "warn" },
  paid: { label: "Paid by MarketplacePH Online Store", tone: "ok" },
  cancelled: { label: "Payout cancelled", tone: "danger" },
} as const;
export type PayoutStatus = keyof typeof PAYOUT_STATUS;

/** Where the sale was made (the same list as the territory channels in 0033). */
export const SALE_CHANNELS = {
  group_order: "FLAME PH Group Order",
  chapter_events: "Chapter event or meetup",
  direct_members: "Direct sale to a member business",
  marketplaceph: "MarketplacePH Online Store",
  negosyodepot: "NegosyoDepot",
  own_online: "Partner's own website or online shop",
  own_store: "Partner's own store or outlet",
  resellers: "Reseller or sub-partner",
} as const;
export type SaleChannel = keyof typeof SALE_CHANNELS;

// ------------------------------------------------------------------------------------------------------------------
// Plain words shown on every commission screen
// ------------------------------------------------------------------------------------------------------------------
export const RECORD_ONLY = {
  en: "flameph.org never pays out by itself. Finance records each step by hand, a second person approves, and MarketplacePH Online Store sends the money.",
  tl: "Hindi kusang nagbabayad ang flameph.org. Itinatala ng finance ang bawat hakbang, may ikalawang taong nag-aapruba, at ang MarketplacePH Online Store ang nagpapadala ng pera.",
} as const;
export const TARGET_NOT_PROMISE = {
  en: "The default rates are targets for negotiation. The rate that counts is the one in a signed agreement; without one, the default applies. None of these is a promised payout.",
  tl: "Ang default na rate ay panimulang target sa usapan. Ang nasusunod ay ang rate sa pinirmahang kasunduan. Hindi ito pangakong bayad.",
} as const;
export const QUALIFIED_SALE = {
  en: "Only qualified sales count: collected by MarketplacePH Online Store, after returns, discounts and VAT, and made in the right territory and channel.",
  tl: "Bilang lang ang benta na nakolekta na ng MarketplacePH Online Store, bawas ang returns, discount at VAT, at nasa tamang lugar at channel.",
} as const;
export const WITHHOLDING_HELP = "Withholding tax kept back when MarketplacePH Online Store pays (for example 5% or 10% on commissions). Ask your accountant for the right rate for each recipient.";

// ------------------------------------------------------------------------------------------------------------------
// Arithmetic: the same rounding as PostgreSQL round(numeric, 2) (half away from zero), done in whole centavos.
// ------------------------------------------------------------------------------------------------------------------
const cents = (n: number) => BigInt(Math.round(n * 100));
const bp = (pct: number) => BigInt(Math.round(pct * 100));   // 5.00% -> 500
function pctOf(c: bigint, p: bigint): bigint {
  const x = c * p;
  const neg = x < BigInt(0);
  const r = ((neg ? -x : x) + BigInt(5000)) / BigInt(10000);
  return neg ? -r : r;
}
const peso = (c: bigint) => Number(c) / 100;

export type SplitResult = { net: number; total_pct: number; total: number; lines: { level: Level; pct: number; amount: number }[] };
/** net x rate, split into four lines. The city line takes the rounding, so the lines always add up to the total. */
export function splitCommission(net: number, s: Split): SplitResult {
  const n = cents(net);
  const t = totalPct(s);
  const total = pctOf(n, bp(t));
  const nat = pctOf(n, bp(s.national_pct));
  const reg = pctOf(n, bp(s.regional_pct));
  const prov = pctOf(n, bp(s.provincial_pct));
  const city = total - nat - reg - prov;
  return {
    net, total_pct: t, total: peso(total),
    lines: [
      { level: "national", pct: s.national_pct, amount: peso(nat) },
      { level: "regional", pct: s.regional_pct, amount: peso(reg) },
      { level: "provincial", pct: s.provincial_pct, amount: peso(prov) },
      { level: "city", pct: s.city_pct, amount: peso(city) },
    ],
  };
}
/** Withholding on a payout total, and what is left to send (same as the generated columns in 0034). */
export function withholding(total: number, pct: number) {
  const w = pctOf(cents(total), bp(pct));
  return { withholding: peso(w), net: peso(cents(total) - w) };
}

/** Worked examples shown on the simulator page (the national team and finance can also type their own). */
export const SAMPLES: { title: string; category: Category; gross: number; deductions: number; refund?: number; withholdingPct?: number; note: string }[] = [
  { title: "Supplier sale through a Group Order", category: "supplier", gross: 112000, deductions: 12000, note: "₱112,000 invoiced, ₱12,000 of VAT and discounts taken off: ₱100,000 net." },
  { title: "Service provider package", category: "service_provider", gross: 50000, deductions: 0, note: "A ₱50,000 service package, fully paid." },
  { title: "Toll manufacturer batch, with a refund", category: "toll_manufacturer", gross: 200000, deductions: 0, refund: 25000, note: "₱200,000 batch; ₱25,000 refunded later for a damaged carton. The refund takes back the same share from every level." },
  { title: "Payout with 10% withholding", category: "supplier", gross: 100000, deductions: 0, withholdingPct: 10, note: "The city or municipal chapter's ₱2,000 share, with 10% withholding tax kept back." },
];

// ------------------------------------------------------------------------------------------------------------------
// Small helpers for the forms
// ------------------------------------------------------------------------------------------------------------------
/** "₱1,234.50" (always two decimals; nothing on flameph.org is a payment). */
export const peso2 = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "—" : `${Number(n) < 0 ? "−" : ""}₱${Math.abs(Number(n)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n: number | string | null | undefined) => (n === null || n === undefined || n === "" ? "—" : `${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`);

/** Money typed by finance: digits, commas and one dot with up to 2 decimals; empty is allowed (null). Undefined when wrong. */
export function parseMoney(v: unknown): number | null | undefined {
  const s = String(v ?? "").replace(/[₱,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(s)) return undefined;
  return Number(s);
}
/** A percent with up to 2 decimals between 0 and max. Empty counts as 0 for the level rates. */
export function parsePct(v: unknown, max = MAX_LEVEL_PCT): number | undefined {
  const s = String(v ?? "").replace(/[%\s]/g, "");
  if (!s) return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s) || Number(s) > max) return undefined;
  return Number(s);
}
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
/** Today's date in Manila, "YYYY-MM-DD". */
export const manilaDay = (offsetDays = 0) => new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
/** First day of this month in Manila. */
export const monthStart = () => `${manilaDay().slice(0, 8)}01`;

/** Messages for the record and edit forms (Admin > Partners > Commissions). */
export const ENTRY_ERRORS: Record<string, string> = {
  reference: "Type the MarketplacePH order, invoice or refund number (at least 2 characters).", date: "Use a real date, today or earlier.",
  collected: "The collection date must be a real date, today or earlier.", amount: "Type the amount in pesos, for example 12500 or 12,500.50.",
  deductions: "Returns, discounts and VAT cannot be more than the amount invoiced.", place: "Choose the province and the city or town of delivery.",
  partner: "Choose the accredited partner and the category.", own: "You cannot record a sale of your own business.", original: "A refund needs an approved sale.",
  duplicate: "That order number is already in the ledger for this partner. Open it instead, or void the old one first.", failed: "That didn't go through. Please try again.",
};

/** The database's own words for a refused change (0034 raises "commission_…: …"), cleaned up for the team. */
export function dbReason(message: string | null | undefined) {
  const m = String(message ?? "").match(/commission_(?:rule|entry|line|payout): (.{3,300})/);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** "province:0305400000" -> its level. */
export const levelOfKey = (key: string): Level => (key === "national" ? "national" : key.startsWith("region:") ? "regional" : key.startsWith("province:") ? "provincial" : "city");

/** One CSV cell (quotes doubled; cells that could start a spreadsheet formula get a leading apostrophe). */
export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
