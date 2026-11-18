// The three regions with their own chapter and events page: NCR, Calabarzon and Central Luzon (/chapters/<slug>).
// Provinces and region names come from src/content/ph-regions.ts, the same list the directory and 0023 use.

import { REGION_OF } from "@/content/ph-regions";

export type FocusRegion = { slug: string; name: string; long: string; region: string; fil: string; match: RegExp };

export const FOCUS_REGIONS: FocusRegion[] = [
  { slug: "ncr", name: "NCR", long: "Metro Manila (NCR)", region: "NCR", fil: "Mga chapter at event sa Metro Manila", match: /\bncr\b|national capital|metro manila/i },
  { slug: "calabarzon", name: "Calabarzon", long: "Calabarzon (Region IV-A)", region: "Region IV-A (CALABARZON)", fil: "Mga chapter at event sa Calabarzon", match: /calabarzon|\biv-a\b|region 4-?a\b/i },
  { slug: "central-luzon", name: "Central Luzon", long: "Central Luzon (Region III)", region: "Region III (Central Luzon)", fil: "Mga chapter at event sa Gitnang Luzon", match: /central luzon|gitnang luzon|region iii\b|region 3\b/i },
];

/** Cities and municipalities of Metro Manila, for chapters or events saved with a city but no province. */
const NCR_CITIES = ["manila", "quezon city", "caloocan", "las piñas", "las pinas", "makati", "malabon", "mandaluyong", "marikina", "muntinlupa", "navotas", "parañaque", "paranaque", "pasay", "pasig", "san juan", "taguig", "valenzuela", "pateros"];

export const regionBySlug = (slug: string) => FOCUS_REGIONS.find((r) => r.slug === slug) ?? null;

export const provincesOf = (r: FocusRegion) => Object.keys(REGION_OF).filter((p) => REGION_OF[p] === r.region);

const norm = (v?: string | null) => (v ?? "").trim().toLowerCase();

/** True when a chapter or event (region, province or city) is in this region. */
export function inRegion(row: { region?: string | null; province?: string | null; city?: string | null }, r: FocusRegion) {
  if (row.region && r.match.test(row.region)) return true;
  const prov = norm(row.province);
  if (prov && provincesOf(r).some((p) => p.toLowerCase() === prov)) return true;
  if (prov && r.match.test(prov)) return true;
  return r.slug === "ncr" && !prov && NCR_CITIES.includes(norm(row.city));
}

/** The focus region a member's province belongs to, if any. */
export const focusRegionOf = (province?: string | null) => FOCUS_REGIONS.find((r) => inRegion({ province }, r)) ?? null;
