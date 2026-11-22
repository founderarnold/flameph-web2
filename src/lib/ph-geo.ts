// Lookups over the official PSGC lists in src/content/ph-psgc.ts (the same rows as ph_regions, ph_provinces.psgc_code
// and ph_cities in migration 0033). Used by the area picker and to label areas.
import { PH_PLACES, PH_PROVINCES, PH_REGIONS } from "@/content/ph-psgc";

export type Region = { code: string; name: string; label: string };
export type Province = { code: string; name: string; region: string };
export type Place = { code: string; name: string; province: string; region: string; city: boolean };

export const REGIONS: Region[] = PH_REGIONS.map(([code, name, label]) => ({ code, name, label }));
export const PROVINCES: Province[] = PH_PROVINCES.map(([code, name, region]) => ({ code, name, region }));
export const PLACES: Place[] = PH_PLACES.map(([code, name, province, region, city]) => ({ code, name, province, region, city: city === 1 }));

const regionBy = new Map(REGIONS.map((r) => [r.code, r]));
const provinceBy = new Map(PROVINCES.map((p) => [p.code, p]));
const placeBy = new Map(PLACES.map((p) => [p.code, p]));

/** Places that sit outside any province of their region (they carry their own code as "province"). */
export const SPECIAL_GROUPS: Record<string, string> = {
  "1999900000": "Special Geographic Area (BARMM)",
  "0990100000": "City of Isabela (Basilan island, Region IX)",
};

export const regionLabel = (code: string | null | undefined) => (code ? regionBy.get(code)?.label ?? code : "");
export const provinceName = (code: string | null | undefined) => (code ? provinceBy.get(code)?.name ?? SPECIAL_GROUPS[code] ?? code : "");
export const place = (code: string | null | undefined) => (code ? placeBy.get(code) ?? null : null);

/** The province (or province name) a member typed on their profile, to its official code. */
export const provinceCodeByName = (name: string | null | undefined) => {
  const n = (name ?? "").trim().toLowerCase();
  return n ? PROVINCES.find((p) => p.name.toLowerCase() === n)?.code ?? null : null;
};
export const regionCodeByLabel = (label: string | null | undefined) => {
  const n = (label ?? "").trim().toLowerCase();
  return n ? REGIONS.find((r) => r.label.toLowerCase() === n || r.name.toLowerCase() === n)?.code ?? null : null;
};

/** The codes of an area, the way 0033 fills them in (region, province, city), for overlap checks and chapter matching. */
export function areaCodes(level: string, code: string | null): { region_code: string | null; province_code: string | null; city_code: string | null } | null {
  if (level === "national") return { region_code: null, province_code: null, city_code: null };
  if (!code) return null;
  if (level === "region") return regionBy.has(code) ? { region_code: code, province_code: null, city_code: null } : null;
  if (level === "province") { const p = provinceBy.get(code); return p ? { region_code: p.region, province_code: p.code, city_code: null } : null; }
  const c = placeBy.get(code);
  return c ? { region_code: c.region, province_code: c.province, city_code: c.code } : null;
}
