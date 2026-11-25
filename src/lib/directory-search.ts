// Directory search and filters for Find members (/members): name or place, industry, chapter, region, and
// "has a mini-website". Pure functions, so the tests can check them without a database.
import { REGION_OF, regionOf } from "@/content/ph-regions";
import { INDUSTRIES, INDUSTRY_NAMES } from "@/lib/industries";

/** Philippine regions, north to south, in the same words saved on listings. */
export const REGIONS = [...new Set(Object.values(REGION_OF))];

export type DirectoryFilters = { q: string; industry: string; chapter: string; region: string; minisite: boolean; category?: string; verified?: boolean };
const CATEGORIES = INDUSTRIES.flatMap((i) => i.subs);
type Row = { owner_id: string; name: string; city: string | null; province: string | null; region?: string | null; sector: string | null; subsector?: string | null; chapter_id?: string | null; verified?: boolean | null };

/** Cleans what came in the address bar: unknown values are dropped, never trusted. */
export function readFilters(sp: Record<string, string | undefined>, chapterIds: string[]): DirectoryFilters {
  return {
    q: (sp.q ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60),
    industry: INDUSTRY_NAMES.includes(sp.industry ?? "") ? sp.industry! : "",
    chapter: chapterIds.includes(sp.chapter ?? "") ? sp.chapter! : "",
    region: REGIONS.includes(sp.region ?? "") ? sp.region! : "",
    minisite: sp.minisite === "1",
    category: CATEGORIES.includes(sp.category ?? "") ? sp.category! : "",
    verified: sp.verified === "1",
  };
}

/** The listing's region: the saved one, or worked out from the province. */
export const rowRegion = (b: Row) => b.region || regionOf(b.province) || null;

export function filterDirectory<T extends Row>(rows: T[], f: DirectoryFilters, withMinisite: Set<string>): T[] {
  return rows.filter((b) =>
    (!f.industry || b.sector === f.industry) &&
    (!f.chapter || b.chapter_id === f.chapter) &&
    (!f.region || rowRegion(b) === f.region) &&
    (!f.minisite || withMinisite.has(b.owner_id)) &&
    (!f.category || b.subsector === f.category) &&
    (!f.verified || Boolean(b.verified)) &&
    (!f.q || `${b.name} ${b.subsector ?? ""} ${b.city ?? ""} ${b.province ?? ""}`.toLowerCase().includes(f.q)));
}

/** The address of the current search, to come back to after Follow. */
export function filtersQuery(f: DirectoryFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.industry) p.set("industry", f.industry);
  if (f.chapter) p.set("chapter", f.chapter);
  if (f.region) p.set("region", f.region);
  if (f.minisite) p.set("minisite", "1");
  if (f.category) p.set("category", f.category);
  if (f.verified) p.set("verified", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}
