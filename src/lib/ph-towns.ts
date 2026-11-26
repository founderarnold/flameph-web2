// Cities and municipalities for the member profile, by the province names the profile uses (src/content/ph-provinces.ts).
// Built from the official PSGC list in src/content/ph-psgc.ts. "City of X" is shown and saved as "X City", the way
// members write it. The two places that sit outside any province go with the province they are on: the City of
// Isabela with Basilan, and the BARMM Special Geographic Area towns with Cotabato.
import { PH_PLACES, PH_PROVINCES } from "@/content/ph-psgc";
import { PROVINCES } from "@/content/ph-provinces";

const HOME_OF: Record<string, string> = { "0990100000": "Basilan", "1999900000": "Cotabato" };
const nameOf = new Map(PH_PROVINCES.map(([code, name]) => [code, name]));

/** The name a member sees and the profile keeps: "City of San Fernando" becomes "San Fernando City". */
export const townLabel = (psgcName: string) => {
  const m = /^City of (.+)$/.exec(psgcName);
  return m ? `${m[1]} City` : psgcName;
};

/** Province name -> its cities and municipalities, A to Z. */
export const TOWNS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = Object.fromEntries(PROVINCES.map((p) => [p, [] as string[]]));
  for (const [, name, province] of PH_PLACES) {
    const home = HOME_OF[province] ?? nameOf.get(province);
    if (home && out[home]) out[home].push(townLabel(name));
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.localeCompare(b));
  return out;
})();

/** Loose key for matching what a member typed before ("san fernando", "City of San Fernando", "Sto. Tomas"). */
const key = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\bsto\.?\s/g, "santo ").replace(/\bsta\.?\s/g, "santa ")
  .replace(/\b(city of|municipality of|city|municipality)\b/g, "").replace(/[^a-z0-9]/g, "");

/** The list entry that matches a typed city in that province, or null. */
export function matchTown(province: string | null | undefined, city: string | null | undefined): string | null {
  const list = province ? TOWNS[province] : undefined;
  const c = (city ?? "").trim();
  if (!list || !c) return null;
  if (list.includes(c)) return c;
  const k = key(c);
  const hits = k ? list.filter((t) => key(t) === k) : [];
  return hits.length === 1 ? hits[0] : null;
}

/** For a profile with a city but no province: the one province whose list has that city, or null. */
export function provinceOfTown(city: string | null | undefined): string | null {
  const k = key(city ?? "");
  if (!k) return null;
  const hits = PROVINCES.filter((p) => TOWNS[p].some((t) => key(t) === k));
  return hits.length === 1 ? hits[0] : null;
}

/** Both values are from the lists, and the city is in that province. Used by the save actions. */
export const validPlace = (province: string, city: string) => PROVINCES.includes(province) && (TOWNS[province] ?? []).includes(city);
