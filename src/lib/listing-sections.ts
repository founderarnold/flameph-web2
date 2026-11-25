import { SOCIALS, type Listing } from "@/lib/listing";

/**
 * My business listing, one section at a time (owner, 25 Nov 2026). Members can fill the sections in any order, skip any
 * of them and come back later: everything saved stays saved, and the list shows which sections still need something.
 */

export type SectionKey = "basics" | "about" | "contact" | "photos" | "hours" | "details" | "website" | "publish";

export type ListingState = {
  biz: Listing | null;
  /** Products with prices added in the products section. */
  productCount: number;
  /** A published mini-website made with FlamePH Pages. */
  hasLiveWebsite: boolean;
  /** False until the 0002 database update (logo, hours and links columns) is run. */
  supportsExtras: boolean;
};

const has = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : Boolean(v));

export const SECTIONS: { key: SectionKey; title: string; blurb: string; done: (s: ListingState) => boolean }[] = [
  { key: "basics", title: "Business basics", blurb: "Name, type of business and where you are",
    done: ({ biz: b }) => !!b && has(b.name) && has(b.city) && has(b.sector) && has(b.province) },
  { key: "about", title: "About and products", blurb: "What you sell, with prices if you can",
    done: ({ biz: b, productCount }) => !!b && String(b.description ?? "").trim().length >= 80 && (has(b.products) || productCount > 0) },
  { key: "contact", title: "Contact buttons", blurb: "How customers reach you",
    done: ({ biz: b }) => !!b && [b.contact_messenger, b.contact_viber, b.contact_phone, b.contact_email].some(has) },
  { key: "photos", title: "Logo and photos", blurb: "Your logo and real photos",
    done: ({ biz: b, supportsExtras }) => !!b && (b.photos?.length ?? 0) > 0 && (!supportsExtras || has(b.logo_url)) },
  { key: "hours", title: "Hours, location and links", blurb: "When you're open and your online shops",
    done: ({ biz: b, supportsExtras }) => !!b && (!supportsExtras || ((has(b.hours) || has(b.map_landmark)) && (SOCIALS.some((x) => has(b[x.key])) || has(b.marketplaceph_url)))) },
  { key: "details", title: "More details", blurb: "Industry, chapter and registration numbers",
    done: ({ biz: b }) => !!b && (has(b.subsector) || has(b.chapter_id)) },
  { key: "website", title: "Mini-website", blurb: "Your free one-page website",
    done: ({ hasLiveWebsite }) => hasLiveWebsite },
  { key: "publish", title: "Check and publish", blurb: "Go live in the directory",
    done: ({ biz: b }) => !!b && (b.published === true || b.publication_status === "published") },
];

export const isSection = (v: unknown): v is SectionKey => SECTIONS.some((s) => s.key === v);

/** Old links (…/account/business#products and so on) open the matching section. */
export const HASH_SECTIONS: Record<string, SectionKey> = { products: "about", details: "details", "business-details": "basics", publish: "publish" };

export function sectionStatus(s: ListingState) {
  const list = SECTIONS.map((x) => ({ key: x.key, title: x.title, blurb: x.blurb, done: x.done(s) }));
  return { list, doneCount: list.filter((x) => x.done).length, firstTodo: list.find((x) => !x.done)?.key ?? "publish" };
}

/** The section after (or before) this one, or null at either end. */
export function neighbour(key: SectionKey, step: 1 | -1): SectionKey | null {
  const i = SECTIONS.findIndex((s) => s.key === key);
  return SECTIONS[i + step]?.key ?? null;
}

/**
 * Reward points for a finished digital storefront. Each one is saved once as a growth milestone, which the existing
 * points total already counts (15 points each), so no database change is needed.
 */
export const STOREFRONT_REWARDS: { key: string; label: string; done: (s: ListingState) => boolean }[] = [
  { key: "storefront:listing", label: "Complete listing: basics, products, contacts, logo and photos, hours and links",
    done: (s) => (["basics", "about", "contact", "photos", "hours"] as SectionKey[]).every((k) => SECTIONS.find((x) => x.key === k)!.done(s)) },
  { key: "storefront:directory", label: "Live in the directory, with your industry or chapter",
    done: (s) => SECTIONS.find((x) => x.key === "publish")!.done(s) && SECTIONS.find((x) => x.key === "details")!.done(s) },
  { key: "storefront:website", label: "Published mini-website",
    done: (s) => s.hasLiveWebsite },
];
