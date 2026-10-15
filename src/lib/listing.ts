/** How complete a business listing is, and what to add next. Shared by the dashboard, the editor and the listing page. */

export type Listing = Record<string, unknown> & { photos?: string[] | null };

export const EXTRA_FIELDS = ["logo_url", "cover_url", "hours", "map_landmark", "facebook_url", "tiktok_url", "instagram_url", "shopee_url", "lazada_url", "website_url"] as const;
export const SOCIALS: { key: (typeof EXTRA_FIELDS)[number]; label: string }[] = [
  { key: "facebook_url", label: "Facebook" },
  { key: "tiktok_url", label: "TikTok" },
  { key: "instagram_url", label: "Instagram" },
  { key: "shopee_url", label: "Shopee" },
  { key: "lazada_url", label: "Lazada" },
  { key: "website_url", label: "Website" },
];

const has = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : Boolean(v);

type Check = { key: string; label: string; tip: string; done: (b: Listing) => boolean; needs?: string };
const CHECKS: Check[] = [
  { key: "logo", label: "Logo", tip: "Add your logo so customers recognise you.", done: (b) => has(b.logo_url), needs: "logo_url" },
  { key: "photos", label: "3 or more photos", tip: "Listings with 3+ photos get more inquiries.", done: (b) => (b.photos?.length ?? 0) >= 3 },
  { key: "description", label: "About your business", tip: "Write 2 to 3 sentences about what you offer. FLAME AI can help.", done: (b) => String(b.description ?? "").trim().length >= 80 },
  { key: "products", label: "Products & services", tip: "List what you sell, with prices if you can.", done: (b) => has(b.products) || Number(b.product_count ?? 0) > 0 },
  { key: "chat", label: "Messenger or Viber", tip: "Add Messenger or Viber so buyers can message you.", done: (b) => has(b.contact_messenger) || has(b.contact_viber) },
  { key: "phone", label: "Phone number", tip: "Add a number buyers can call.", done: (b) => has(b.contact_phone) },
  { key: "shop", label: "MarketplacePH shop", tip: "Link your free MarketplacePH store so people can order.", done: (b) => has(b.marketplaceph_url) },
  { key: "hours", label: "Opening hours", tip: "Tell buyers when you're open.", done: (b) => has(b.hours), needs: "hours" },
  { key: "socials", label: "Social or shop links", tip: "Add your Facebook, TikTok, Shopee or other links.", done: (b) => SOCIALS.some((s) => has(b[s.key])), needs: "facebook_url" },
  { key: "published", label: "Shown in the directory", tip: "Turn on \"Show my business publicly\" so people can find you.", done: (b) => Boolean(b.published) },
];

/**
 * `supportsExtras` is false until the 0002 database update is run; checks for the new fields are skipped then,
 * so nobody is asked to fill in a field they can't save yet.
 */
export function listingStrength(b: Listing | null, supportsExtras = true) {
  const checks = CHECKS.filter((c) => !c.needs || supportsExtras);
  if (!b) return { percent: 0, done: [] as Check[], missing: checks };
  const done = checks.filter((c) => c.done(b));
  return { percent: Math.round((done.length / checks.length) * 100), done, missing: checks.filter((c) => !c.done(b)) };
}

/** True once the listing table has the new columns (a row from select("*") includes them, even when empty). */
export const hasExtras = (row: Listing | null | undefined) => !row || "logo_url" in row;
