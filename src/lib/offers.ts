// Partner accreditation (Step 2): Supplier Best Offer. Pure rules and plain words, shared by /partner-us/offers, the
// server actions, Admin > Partners > Supplier offers, the comparison screen and the tests. The database
// (0032_supplier_offers.sql) enforces the same statuses, limits, weights, pass mark and access rules.

export const OFFER_STATUS = {
  draft: { label: "Draft (not sent yet)", tone: "info" },
  submitted: { label: "Sent, waiting for review", tone: "info" },
  needs_changes: { label: "Needs changes from you", tone: "warn" },
  selected: { label: "Chosen as a Best Offer", tone: "ok" },
  not_selected: { label: "Not chosen this time", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "info" },
} as const;
export type OfferStatus = keyof typeof OFFER_STATUS;
/** The supplier can change the offer only in these. */
export const OFFER_EDITABLE: OfferStatus[] = ["draft", "needs_changes"];

export const PRODUCT_GROUPS = {
  packaging: "Packaging (bags, boxes, bottles, labels)",
  food_ingredients: "Food ingredients and raw materials",
  beverages: "Beverages and drink ingredients",
  personal_care: "Personal care and cosmetics",
  household_cleaning: "Household and cleaning products",
  office_school: "Office and school supplies",
  equipment_tools: "Equipment, tools and machines",
  agri_inputs: "Farm inputs (seeds, feeds, fertilizer)",
  construction_hardware: "Construction and hardware",
  garments_textiles: "Garments and textiles",
  electronics_gadgets: "Electronics and gadgets",
  other: "Other products",
} as const;
export type ProductGroup = keyof typeof PRODUCT_GROUPS;

export const VAT_BASIS = {
  vat_inclusive: "Prices already include 12% VAT",
  vat_exclusive: "Prices do NOT include VAT yet (12% will be added)",
  non_vat: "We are not VAT-registered (no VAT)",
} as const;
export type VatBasis = keyof typeof VAT_BASIS;
export const VAT_RATE = 0.12;

export const SHIPPING_TERMS = {
  free_delivery: "Free delivery to the member",
  delivery_fee: "We deliver, with a delivery fee",
  courier_buyer_pays: "By courier, the member pays the courier",
  pickup_only: "Pickup only",
} as const;

export const SAMPLES = {
  free: "Free sample available",
  paid: "Sample available for a fee",
  none: "No samples",
} as const;

export const STOCK = {
  in_stock: "In stock",
  made_to_order: "Made to order",
  limited: "Limited stock",
  seasonal: "Seasonal",
} as const;

/** What the comparison counts in, so offers sold in different pack sizes can be compared fairly. */
export const BASE_UNITS = {
  piece: { label: "piece", help: "pieces, pcs, bottles, bags" },
  kg: { label: "kg", help: "kilograms (500 g = 0.5)" },
  liter: { label: "liter", help: "liters (500 ml = 0.5)" },
  meter: { label: "meter", help: "meters (for rolls, cloth, wire)" },
  set: { label: "set", help: "sets or kits" },
} as const;
export type BaseUnit = keyof typeof BASE_UNITS;
/** "100 pieces", "18 liters", "25 kg". */
export const unitCount = (n: number | string, u: BaseUnit) => `${Number(n)} ${BASE_UNITS[u].label}${Number(n) === 1 || u === "kg" ? "" : "s"}`;

/** The five screens of the offer form. One group of questions per screen, so it is easy on a phone. */
export const OFFER_STEPS = [
  { n: 1, key: "about", title: "About the offer", fil: "Tungkol sa alok" },
  { n: 2, key: "products", title: "Products and prices", fil: "Mga produkto at presyo" },
  { n: 3, key: "delivery", title: "Delivery, samples and after-sales", fil: "Delivery, sample at serbisyo pagkatapos bumili" },
  { n: 4, key: "files", title: "Photos and files", fil: "Mga litrato at file" },
  { n: 5, key: "send", title: "Commission and send", fil: "Commission at ipadala" },
] as const;
export const OFFER_LAST_STEP = OFFER_STEPS.length;

// ------------------------------------------------------------------------------------------------------------------
// Limits (Supabase Free plan). The database refuses more than 20 offers per supplier and 30 products per offer.
// ------------------------------------------------------------------------------------------------------------------
export const MAX_OFFERS = 20;
export const MAX_ITEMS = 30;
export const MAX_TIERS = 4;
export const MAX_OFFER_FILES = 12;
export const MAX_PHOTOS_PER_ITEM = 3;

export const OFFER_FILE_TYPES = {
  product_photo: { label: "Product photo", help: "A clear photo of the product or its label. Photos are made smaller on your phone." },
  price_list: { label: "Price list", help: "Your official price list or quotation (PDF or photo)." },
  spec_sheet: { label: "Product details or spec sheet", help: "Sizes, materials, ingredients, shelf life." },
  certification: { label: "Certificate", help: "GMP, HACCP, Halal, ISO, organic, test results." },
  fda: { label: "FDA product registration (CPR) or notification", help: "For food, drinks, cosmetics and household chemicals." },
  other: { label: "Other file", help: "Catalog, brochure or anything that helps." },
} as const;
export type OfferFileType = keyof typeof OFFER_FILE_TYPES;
export const OFFER_FILE_KEYS = Object.keys(OFFER_FILE_TYPES) as OfferFileType[];
export const isOfferFileType = (v: unknown): v is OfferFileType => typeof v === "string" && v in OFFER_FILE_TYPES;

// ------------------------------------------------------------------------------------------------------------------
// Money. flameph.org never collects, holds, pays out or moves money. Shown, and never hidden, wherever a commission
// figure appears (the wording proposed in the Step 0 report; owner may change it).
// ------------------------------------------------------------------------------------------------------------------
export const MONEY_NOTICE = {
  en: "These figures are a record only. No money passes through flameph.org. Commissions, penalties and refunds are paid and collected by MarketplacePH Online Store.",
  tl: "Tala lang ang mga numerong ito. Walang perang dumadaan sa flameph.org. Ang MarketplacePH Online Store ang nagbabayad at naniningil ng commission, multa at refund.",
} as const;
export const COMMISSION_HELP = "This is only your proposal. It is discussed and agreed later in a signed agreement with MarketplacePH Online Store; it is not a promise or a payout.";

export const OFFER_DECLARATION = {
  en: "I confirm that these prices and terms are true and that my business can honour them for FLAME PH members until the date I gave. I understand the commission is a proposal to be negotiated, and that flameph.org does not collect or hold any money.",
  tl: "Pinapatunayan kong totoo ang mga presyo at kondisyon, at kaya itong ibigay ng aming negosyo sa mga FLAME PH member hanggang sa petsang ibinigay ko.",
} as const;

// ------------------------------------------------------------------------------------------------------------------
// Scoring (national team only). The weights and pass mark are fixed by the program and checked by the database.
// ------------------------------------------------------------------------------------------------------------------
export const SCORE_PARTS = [
  { key: "price_value", max: 30, label: "Price and member value", help: "Landed cost per unit and member discount compared with the other offers." },
  { key: "quality_samples", max: 25, label: "Quality and samples", help: "Product quality, photos, specs and sample results (chapter sample tests come in the next step)." },
  { key: "compliance_reliability", max: 20, label: "Compliance and reliability", help: "Permits, FDA, certificates, capacity and stock you can count on." },
  { key: "commission_benefits", max: 15, label: "Commission and chapter benefits", help: "The proposed commission and other benefits for members and chapters." },
  { key: "logistics_support", max: 10, label: "Delivery and support", help: "Delivery areas, lead time, warranty and returns." },
] as const;
export type ScoreKey = (typeof SCORE_PARTS)[number]["key"];
export const SCORE_KEYS = SCORE_PARTS.map((p) => p.key) as ScoreKey[];
export const PASS_MARK = 80;

export type ScoreRow = { reviewer_id: string | null; revision: number; total: number; compliance_pass: boolean } & Partial<Record<ScoreKey, number>>;
export type OfferResult = { scores: number; average: number | null; compliance: "pass" | "fail" | "not_checked"; canSelect: boolean };

/** The national team's result for one version: the average, and the compliance gate (every score must pass it). */
export function offerResult(scores: ScoreRow[], revision: number): OfferResult {
  const mine = scores.filter((s) => s.revision === revision);
  if (!mine.length) return { scores: 0, average: null, compliance: "not_checked", canSelect: false };
  const average = Math.round((mine.reduce((n, s) => n + s.total, 0) / mine.length) * 10) / 10;
  const compliance = mine.every((s) => s.compliance_pass) ? "pass" : "fail";
  return { scores: mine.length, average, compliance, canSelect: compliance === "pass" && average >= PASS_MARK };
}

/** A whole number between 0 and the part's maximum, or null. */
export function cleanScore(v: unknown, max: number): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

// ------------------------------------------------------------------------------------------------------------------
// Prices: normalized landed cost per unit and member discount.
// ------------------------------------------------------------------------------------------------------------------
export type Tier = { min_qty: number; price: number };
export type ItemRow = {
  id: string; position: number; product_name: string; brand: string | null; sku: string | null; description: string | null;
  sell_unit: string; base_unit: BaseUnit; base_qty: number; regular_price: number | null; wholesale_price: number | null; member_price: number;
  tiers: Tier[]; moq: number; monthly_capacity: number | null; stock_status: keyof typeof STOCK; lead_time_days: number | null; shipping_per_unit: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** A price as members would pay it, with VAT if the supplier quoted without it. */
export const withVat = (price: number, vat: VatBasis | null | undefined) => (vat === "vat_exclusive" ? price * (1 + VAT_RATE) : price);

/** Landed cost of one selling unit (member price + VAT where needed + delivery cost per unit), and per comparison unit. */
export function landedCost(item: Pick<ItemRow, "member_price" | "shipping_per_unit" | "base_qty">, vat: VatBasis | null | undefined) {
  const perSellUnit = withVat(Number(item.member_price), vat) + Number(item.shipping_per_unit || 0);
  const qty = Number(item.base_qty) || 1;
  return { perSellUnit: round2(perSellUnit), perBaseUnit: round2(perSellUnit / qty), perBaseUnitExact: perSellUnit / qty };
}

/** Best quantity price for an order size (tiers), never above the member price. */
export function tierPrice(item: Pick<ItemRow, "member_price" | "tiers">, qty: number) {
  let p = Number(item.member_price);
  for (const t of item.tiers ?? []) if (qty >= t.min_qty && t.price < p) p = t.price;
  return p;
}

/** Member discount against the regular price, in percent (null without a regular price). */
export function memberDiscount(item: Pick<ItemRow, "regular_price" | "member_price">): number | null {
  const r = Number(item.regular_price);
  if (!item.regular_price || !(r > 0)) return null;
  return Math.round(((r - Number(item.member_price)) / r) * 1000) / 10;
}

/**
 * Side-by-side comparison of offers: for each comparison unit (piece, kg, ...) the lowest landed cost per unit in each
 * offer, the best among all offers, and a SUGGESTED price score out of 30 (30 for the lowest, less in proportion). The
 * reviewer decides the real score.
 */
export function compareOffers(offers: { id: string; vat_basis: VatBasis | null; items: ItemRow[] }[]) {
  const best: Partial<Record<BaseUnit, number>> = {};
  const perOffer = offers.map((o) => {
    const low: Partial<Record<BaseUnit, number>> = {};
    for (const it of o.items) {
      const c = landedCost(it, o.vat_basis).perBaseUnitExact;
      if (low[it.base_unit] === undefined || c < low[it.base_unit]!) low[it.base_unit] = c;
    }
    for (const [u, c] of Object.entries(low) as [BaseUnit, number][]) if (best[u] === undefined || c < best[u]!) best[u] = c;
    const discounts = o.items.map(memberDiscount).filter((d): d is number => d !== null);
    return { id: o.id, low, avgDiscount: discounts.length ? Math.round((discounts.reduce((a, b) => a + b, 0) / discounts.length) * 10) / 10 : null };
  });
  return perOffer.map((p) => {
    // The suggestion uses the unit the offers share most; with nothing in common there is no suggestion.
    const units = (Object.keys(p.low) as BaseUnit[]).filter((u) => perOffer.filter((q) => q.low[u] !== undefined).length > 1);
    const u = units.sort((a, b) => perOffer.filter((q) => q.low[b] !== undefined).length - perOffer.filter((q) => q.low[a] !== undefined).length)[0];
    const suggested = u ? Math.round(30 * (best[u]! / p.low[u]!)) : null;
    const lowest = Object.fromEntries((Object.entries(p.low) as [BaseUnit, number][]).map(([k, v]) => [k, round2(v)])) as Partial<Record<BaseUnit, number>>;
    const isBest = Object.fromEntries((Object.entries(p.low) as [BaseUnit, number][]).map(([k, v]) => [k, Math.abs(v - best[k]!) < 1e-9])) as Partial<Record<BaseUnit, boolean>>;
    return { id: p.id, lowest, isBest, avgDiscount: p.avgDiscount, suggestedPriceScore: suggested, suggestedUnit: u ?? null };
  });
}

export const peso = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : `₱${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ------------------------------------------------------------------------------------------------------------------
// Checks. Saving a draft checks formats only; sending checks that everything required is there.
// ------------------------------------------------------------------------------------------------------------------
/** A money amount typed by the supplier ("1,250.50", "₱ 380"): a number with up to 2 decimals, or null. */
export function parseMoney(v: unknown): number | null {
  const s = String(v ?? "").replace(/[₱,\s]|PHP/gi, "");
  if (!s) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}
export function parseCount(v: unknown, max: number): number | null {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,10}$/.test(s)) return NaN;
  const n = Number(s);
  return n <= max ? n : NaN;
}
export function parseQty(v: unknown): number | null {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  if (!s) return null;
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return NaN;
  const n = Number(s);
  return n > 0 ? n : NaN;
}

/** Quantity tiers from the form: up to 4 rows of "from this many units, this price"; blank rows are skipped. */
export function parseTiers(rows: { min: unknown; price: unknown }[], memberPrice: number): Tier[] | "bad" {
  const out: Tier[] = [];
  for (const r of rows.slice(0, MAX_TIERS)) {
    const min = parseCount(r.min, 10_000_000);
    const price = parseMoney(r.price);
    if (min === null && price === null) continue;
    if (min === null || price === null || Number.isNaN(min) || Number.isNaN(price) || min < 2 || price <= 0 || price > memberPrice) return "bad";
    out.push({ min_qty: min, price });
  }
  out.sort((a, b) => a.min_qty - b.min_qty);
  if (new Set(out.map((t) => t.min_qty)).size !== out.length) return "bad";
  return out;
}

export type OfferRow = {
  id: string; status: OfferStatus; revision: number; title: string | null; product_group: ProductGroup | null; valid_until: string | null;
  vat_basis: VatBasis | null; serviceable_areas: string | null; shipping_terms: keyof typeof SHIPPING_TERMS | null; shipping_note: string | null;
  lead_time_days: number | null; warranty: string | null; returns_policy: string | null; sample_availability: keyof typeof SAMPLES | null;
  sample_terms: string | null; certifications: string | null; commission_pct: number | null; commission_note: string | null;
  declaration_at: string | null; submitted_at: string | null; decided_at: string | null; decision_reasons: string[]; decision_note: string | null;
  selection_reason: string | null; created_at: string; updated_at: string;
};
export const OFFER_COLS = "id, status, revision, title, product_group, valid_until, vat_basis, serviceable_areas, shipping_terms, shipping_note, lead_time_days, warranty, returns_policy, sample_availability, sample_terms, certifications, commission_pct, commission_note, declaration_at, submitted_at, decided_at, decision_reasons, decision_note, selection_reason, created_at, updated_at";
export const ITEM_COLS = "id, position, product_name, brand, sku, description, sell_unit, base_unit, base_qty, regular_price, wholesale_price, member_price, tiers, moq, monthly_capacity, stock_status, lead_time_days, shipping_per_unit";

export type OfferMissing = { step: number; what: string };
const todayManila = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** What still needs an answer before sending, with the screen to fix it on. */
export function offerMissing(o: Pick<OfferRow, "title" | "product_group" | "valid_until" | "vat_basis" | "serviceable_areas" | "shipping_terms" | "lead_time_days" | "sample_availability" | "commission_pct">, itemCount: number, photoCount: number, today = todayManila()): OfferMissing[] {
  const out: OfferMissing[] = [];
  const need = (v: unknown, step: number, what: string) => { if (v === null || v === undefined || String(v).trim() === "") out.push({ step, what }); };
  need(o.title, 1, "Name of the offer");
  need(o.product_group, 1, "Product group");
  need(o.valid_until, 1, "Prices valid until");
  if (o.valid_until && o.valid_until < today) out.push({ step: 1, what: "Prices valid until: the date has passed" });
  need(o.vat_basis, 1, "VAT");
  if (itemCount === 0) out.push({ step: 2, what: "At least one product with its prices" });
  need(o.serviceable_areas, 3, "Areas you deliver to");
  need(o.shipping_terms, 3, "How members get the products");
  need(o.lead_time_days, 3, "Days from order to delivery");
  need(o.sample_availability, 3, "Samples");
  if (photoCount === 0) out.push({ step: 4, what: "At least one product photo" });
  need(o.commission_pct, 5, "Proposed commission (type 0 if none)");
  return out;
}

// ------------------------------------------------------------------------------------------------------------------
// Review reasons the supplier sees, and plain messages.
// ------------------------------------------------------------------------------------------------------------------
export const OFFER_REASONS = {
  price_high: "The landed price is higher than other offers",
  member_value: "The member discount is too small",
  moq_high: "The minimum order is too big for MSME members",
  capacity_low: "Monthly supply is too small for members' needs",
  area_limited: "You deliver to too few member areas",
  lead_time_long: "Delivery takes too long",
  compliance: "Permits, FDA registration or certificates are missing or expired",
  quality: "Quality, photos or sample results were not good enough",
  info_missing: "Some information or photos are missing or unclear",
  commission: "The commission proposal needs discussion",
  other: "Other reason (see the note)",
} as const;
export type OfferReason = keyof typeof OFFER_REASONS;
export const OFFER_REASON_KEYS = Object.keys(OFFER_REASONS) as OfferReason[];
export const isOfferReason = (v: unknown): v is OfferReason => typeof v === "string" && v in OFFER_REASONS;

export const OFFER_ERRORS: Record<string, string> = {
  not_supplier: "Best Offers are for accredited suppliers. Apply as a supplier first; once the national team approves you, you can send offers.",
  limit: `You can have up to ${MAX_OFFERS} offers. Withdraw or reuse an old one.`,
  item_limit: `An offer can have up to ${MAX_ITEMS} products. Make a second offer for the rest.`,
  locked: "This offer was already sent, so it can't be changed now. If it needs changes, the review team will open it for you.",
  missing: "Some answers are still missing. See the list below.",
  declaration: "Please tick the declaration box.",
  date: "Please choose a date that has not passed yet.",
  price: "Please check the prices: numbers only, like 380 or 1250.50. The member price can't be higher than the regular price.",
  tiers: "Please check the quantity prices: each needs a quantity of 2 or more and a price lower than the member price.",
  qty: "Please check the quantities: whole numbers, like 10 or 500.",
  base_qty: "Please check how many pieces, kg or liters are in one selling unit (more than 0).",
  name: "Please give the product name and how it is sold.",
  commission: "Please type the proposed commission as a percentage from 0 to 50, like 5 or 7.5.",
  doc_type: "Choose what kind of file this is.",
  empty: "Please choose a file.",
  size: "The file is too big. The limit is 4 MB per file. Take a photo instead (the page makes photos smaller), or save the PDF smaller.",
  format: "Please upload a PDF, JPG, PNG or WEBP file.",
  too_many: `An offer can have up to ${MAX_OFFER_FILES} files. Delete one first.`,
  photos: `A product can have up to ${MAX_PHOTOS_PER_ITEM} photos.`,
  total: "Your partner files have reached 50 MB in total. Delete an old file first.",
  unavailable: "Best Offers open after FLAME PH finishes a database update. Please try again later.",
  failed: "That didn't go through. Please try again.",
};

export const OFFER_DONE: Record<string, string> = {
  started: "Your offer is started. Fill in each screen; it saves as you go.",
  saved: "Saved. You can close this page and continue anytime.",
  item_saved: "Product saved.",
  item_deleted: "Product removed.",
  uploaded: "File received. It is encrypted and only the national review team can open it.",
  deleted: "File deleted.",
  submitted: "Sent! The national team will compare and review your offer. We will tell you in your Inbox and by email.",
  withdrawn: "Your offer was withdrawn.",
  reopened: "Your offer is open again as a draft. Change what you need, then send it again as a new version.",
  removed: "Draft deleted.",
};
