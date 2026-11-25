import { SOCIALS, type Listing } from "@/lib/listing";

/**
 * My business listing as a 6-step journey (owner, 25 Nov 2026). Members can do the steps in any order, skip any of them
 * and come back later: everything saved stays saved. Saving step 6 publishes the listing automatically once everything
 * needed is there. After that, a "Level up" journey: more details, a mini-website and a MarketplacePH store.
 */

export type StepKey = "basics" | "about" | "products" | "contact" | "photos" | "hours";
export type ExtraKey = "details" | "website" | "marketplace" | "publish";
export type SectionKey = StepKey | ExtraKey;

export type ListingState = {
  biz: Listing | null;
  /** Products and packages with prices. */
  productCount: number;
  /** A published mini-website made with FlamePH Pages. */
  hasLiveWebsite: boolean;
  /** False until the 0002 database update (logo, hours and links columns) is run. */
  supportsExtras: boolean;
};

const has = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : Boolean(v));
/** The same minimum the publish check uses (business_submission_missing_requirements). */
export const DESCRIPTION_MIN = 80;

export const STEPS: { key: StepKey; title: string; blurb: string; done: (s: ListingState) => boolean }[] = [
  { key: "basics", title: "Business basics", blurb: "Name, type of business and where you are",
    done: ({ biz: b }) => !!b && has(b.name) && has(b.city) && has(b.sector) && has(b.province) },
  { key: "about", title: "About your business", blurb: `What you offer and who you serve, at least ${DESCRIPTION_MIN} characters`,
    done: ({ biz: b }) => !!b && String(b.description ?? "").trim().length >= DESCRIPTION_MIN },
  { key: "products", title: "Products & packages with prices", blurb: "What you sell, with prices",
    done: ({ biz: b, productCount }) => !!b && (productCount > 0 || has(b.products)) },
  { key: "contact", title: "Contact buttons", blurb: "How customers reach you",
    done: ({ biz: b }) => !!b && [b.contact_messenger, b.contact_viber, b.contact_phone, b.contact_email].some(has) },
  { key: "photos", title: "Logo and photos", blurb: "Your logo and real photos",
    done: ({ biz: b, supportsExtras }) => !!b && (b.photos?.length ?? 0) > 0 && (!supportsExtras || has(b.logo_url)) },
  { key: "hours", title: "Hours, location and links", blurb: "When you're open, where to find you and your online shops",
    done: ({ biz: b, supportsExtras }) => !!b && (!supportsExtras || ((has(b.hours) || has(b.map_landmark)) && (SOCIALS.some((x) => has(b[x.key])) || has(b.marketplaceph_url)))) },
];

export const EXTRAS: ExtraKey[] = ["details", "website", "marketplace", "publish"];
export const isSection = (v: unknown): v is SectionKey => STEPS.some((s) => s.key === v) || EXTRAS.includes(v as ExtraKey);
export const isStep = (v: SectionKey): v is StepKey => STEPS.some((s) => s.key === v);

/** Old links (…/account/business#products and so on) open the matching step. */
export const HASH_SECTIONS: Record<string, SectionKey> = { products: "products", details: "details", "business-details": "basics", publish: "publish" };

export const isPublished = (b: Listing | null) => !!b && (b.published === true || b.publication_status === "published");
export const hasDetails = (b: Listing | null) => !!b && (has(b.subsector) || has(b.chapter_id));

export function stepStatus(s: ListingState) {
  const list = STEPS.map((x) => ({ key: x.key, title: x.title, blurb: x.blurb, done: x.done(s) }));
  return { list, doneCount: list.filter((x) => x.done).length, firstTodo: list.find((x) => !x.done)?.key ?? null };
}

/** The step after (or before) this one, or null at either end of the 6 steps. */
export function neighbour(key: SectionKey, step: 1 | -1): StepKey | null {
  const i = STEPS.findIndex((s) => s.key === key);
  return i < 0 ? null : STEPS[i + step]?.key ?? null;
}

/**
 * Reward points. Each one is saved once as a growth milestone, which the existing points total already counts
 * (POINTS.milestone, 15 each), so no database change is needed.
 */
export type Reward = { key: string; label: string; done: (s: ListingState) => boolean };

/** One for each finished step, one for the complete listing and one for being live in the directory. */
export const LISTING_REWARDS: Reward[] = [
  ...STEPS.map((x, i) => ({ key: `listing:${x.key}`, label: `Step ${i + 1}: ${x.title}`, done: x.done })),
  { key: "storefront:listing", label: "All 6 steps done", done: (s) => STEPS.every((x) => x.done(s)) },
  { key: "listing:published", label: "Published in the FLAME PH directory", done: (s) => isPublished(s.biz) },
];

/** The Level up journey after publishing. */
export const LEVEL_UP_REWARDS: Reward[] = [
  { key: "storefront:directory", label: "More details: your industry or chapter, while listed", done: (s) => isPublished(s.biz) && hasDetails(s.biz) },
  { key: "storefront:website", label: "Published mini-website (your landing page)", done: (s) => s.hasLiveWebsite },
];

/** MarketplacePH store parts, read from marketplaceph.com when the member presses Sync. */
export type StoreSummary = {
  activated: boolean;
  store: { name: string; url: string } | null;
  profile: boolean; firstListing: boolean; payShip: boolean; verified: boolean;
  listingCount: number;
};
export const STORE_REWARDS: { key: string; label: string; done: (m: StoreSummary) => boolean }[] = [
  { key: "mph:store", label: "Opened your MarketplacePH store", done: (m) => !!m.store },
  { key: "mph:profile", label: "Store profile: logo, description and phone", done: (m) => m.profile },
  { key: "mph:listing", label: "First product or service posted", done: (m) => m.firstListing },
  { key: "mph:pay_ship", label: "Payment and delivery options set", done: (m) => m.payShip },
  { key: "mph:verified", label: "Store verification sent or approved", done: (m) => m.verified },
  { key: "mph:5plus", label: "More than 5 products or services", done: (m) => m.listingCount > 5 },
  { key: "mph:10plus", label: "More than 10 products or services", done: (m) => m.listingCount > 10 },
];

export const ALL_REWARD_KEYS = [...LISTING_REWARDS, ...LEVEL_UP_REWARDS].map((r) => r.key).concat(STORE_REWARDS.map((r) => r.key));
