"use client";
import { useMemo, useState } from "react";
import { PLACES, PROVINCES, REGIONS, SPECIAL_GROUPS } from "@/lib/ph-geo";

const LEVELS = [
  ["national", "Whole Philippines"],
  ["region", "Region"],
  ["province", "Province"],
  ["city", "City or town"],
] as const;
type Level = (typeof LEVELS)[number][0];

/**
 * Picks one area by its official PSGC code: the whole country, a region, a province, or a city or municipality.
 * Phone first: one choice per row, big tap targets, and the lists narrow as you go (region, then province, then town).
 * Sends two fields with the form: level and code.
 */
export function AreaPicker() {
  const [level, setLevel] = useState<Level>("province");
  const [region, setRegion] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");

  const provinces = useMemo(() => {
    const list = PROVINCES.filter((p) => !region || p.region === region).map((p) => ({ code: p.code, name: p.name }));
    if (level === "city") {
      for (const [code, name] of Object.entries(SPECIAL_GROUPS)) if (!region || PLACES.some((c) => c.province === code && c.region === region)) list.push({ code, name });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [region, level]);
  const towns = useMemo(() => (province ? PLACES.filter((c) => c.province === province).sort((a, b) => a.name.localeCompare(b.name)) : []), [province]);
  const code = level === "national" ? "" : level === "region" ? region : level === "province" ? province : city;
  const ready = level === "national" || !!code;

  return (
    <div className="space-y-3">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="code" value={code} />
      <fieldset>
        <legend className="label">How big is this area?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LEVELS.map(([k, l]) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="area_level_choice" value={k} checked={level === k} onChange={() => { setLevel(k); setCity(""); if (k === "region") setProvince(""); }} className="check" />
              <span className="text-[15px] font-semibold">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {level !== "national" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="ap-region" className="label text-sm">Region</label>
            <select id="ap-region" className="input" value={region} onChange={(e) => { setRegion(e.target.value); setProvince(""); setCity(""); }}>
              <option value="">{level === "region" ? "Choose a region" : "All regions"}</option>
              {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>
          {level !== "region" && (
            <div className="field">
              <label htmlFor="ap-province" className="label text-sm">Province</label>
              <select id="ap-province" className="input" value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); }}>
                <option value="">Choose a province</option>
                {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </div>
          )}
          {level === "city" && (
            <div className="field">
              <label htmlFor="ap-city" className="label text-sm">City or municipality</label>
              <select id="ap-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} disabled={!province}>
                <option value="">{province ? `Choose one of ${towns.length}` : "Choose the province first"}</option>
                {towns.map((t) => <option key={t.code} value={t.code}>{t.name}{t.city ? "" : " (municipality)"}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      <p className="field-help">
        {level === "national" ? "The whole country: every region, province, city and town." : level === "region" ? "Every province, city and town in the region." : level === "province" ? "Every city and town in the province, including highly urbanized cities inside it (for example Angeles City in Pampanga)." : "Only this city or municipality."}
        {" "}Official PSGC code{code ? `: ${code}` : "s"}.
      </p>
      <button type="submit" disabled={!ready} className="btn btn-primary min-h-11 w-full disabled:opacity-50 sm:w-auto">Add this area</button>
    </div>
  );
}
