// The approved flameph.org business listings, in the shape the shared business directory (pages.flameph.org/directory)
// shows. Only the fields that are always public on a listing (src/lib/privacy.ts ALWAYS_PUBLIC) are included:
// name, industry, city and province, and the logo or first photo. No contact details, no owner ids.

export type DirectoryCategory = "food" | "retail" | "services" | "professional" | "real_estate";

export type DirectoryFeedItem = {
  name: string;
  slug: string;
  category: DirectoryCategory | null;
  sector: string | null;
  city: string | null;
  logo_url: string | null;
  url: string;
  verified: boolean;
  updated_at: string | null;
};

type Row = {
  name: string; slug: string; sector: string | null; subsector?: string | null; city: string | null; province: string | null;
  logo_url?: string | null; photos?: string[] | null; verified?: boolean | null; updated_at?: string | null;
  published?: boolean | null; publication_status?: string | null; lifecycle_status?: string | null; risk_level?: string | null;
};

const PROFESSIONAL = new Set(["Professional services", "Accounting services", "Legal services", "Insurance", "Tax compliance"]);

/** flameph.org industries mapped onto the directory's five sections. "Other" is listed under All only. */
export function directoryCategory(sector: string | null | undefined, subsector?: string | null): DirectoryCategory | null {
  if (subsector === "Real estate") return "real_estate";
  if (subsector && PROFESSIONAL.has(subsector)) return "professional";
  switch (sector) {
    case "Food & beverage": return "food";
    case "Retail / sari-sari": case "Agriculture": case "Manufacturing": case "Crafts & fashion": case "Beauty & wellness": return "retail";
    case "Services": case "Technology": case "Tourism": return "services";
    default: return null;
  }
}

/** Same rule as PUBLIC_BUSINESS_FILTERS: published, approved and low risk. */
export function isApprovedListing(b: Row): boolean {
  return b.published === true && b.publication_status === "published" && b.lifecycle_status === "approved" && b.risk_level === "low";
}

/** Storage paths are kept relative in the database; `media` turns them into public addresses. Only https is passed on. */
function https(u: unknown, media: (path: string) => string | null): string | null {
  if (typeof u !== "string" || !u || u.includes("..")) return null;
  const full = media(u);
  return full && full.startsWith("https://") ? full : null;
}

export function toFeedItem(b: Row, siteUrl: string, media: (path: string) => string | null): DirectoryFeedItem {
  const place = [b.city, b.province].filter(Boolean).join(", ");
  return {
    name: String(b.name).slice(0, 80),
    slug: b.slug,
    category: directoryCategory(b.sector, b.subsector),
    sector: b.sector ?? null,
    city: place ? place.slice(0, 80) : null,
    logo_url: https(b.logo_url, media) ?? https(b.photos?.[0], media),
    url: `${siteUrl}/members/${encodeURIComponent(b.slug)}`,
    verified: b.verified === true,
    updated_at: b.updated_at ?? null,
  };
}
