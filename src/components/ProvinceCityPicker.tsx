"use client";
import { useMemo, useState } from "react";
import { PROVINCES } from "@/content/ph-provinces";
import { TOWNS, matchTown, provinceOfTown } from "@/lib/ph-towns";

/**
 * Province and city or municipality for the member profile: two required drop-downs, the second narrows to the
 * province chosen. Sends the names as the fields "province" and "city" (the profile keeps names, not codes).
 * A city typed on an older profile is picked for the member when it matches the list; otherwise they choose it.
 */
export function ProvinceCityPicker({ province: startProvince, city: startCity, idPrefix = "pc", className = "grid gap-4 sm:grid-cols-2" }: {
  province?: string | null; city?: string | null; idPrefix?: string; className?: string;
}) {
  const firstProvince = startProvince && PROVINCES.includes(startProvince) ? startProvince : provinceOfTown(startCity) ?? "";
  const [province, setProvince] = useState(firstProvince);
  const [city, setCity] = useState(matchTown(firstProvince, startCity) ?? "");
  const towns = useMemo(() => (province ? TOWNS[province] ?? [] : []), [province]);
  const typed = (startCity ?? "").trim();
  const oldCityNotOnList = Boolean(typed) && !matchTown(firstProvince, startCity);

  return (
    <div className={className}>
      <div>
        <label className="label" htmlFor={`${idPrefix}-province`}>Province *</label>
        <select id={`${idPrefix}-province`} name="province" required value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); }} className="input min-h-11">
          <option value="" disabled>Choose your province…</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-city`}>City or municipality *</label>
        <select id={`${idPrefix}-city`} name="city" required value={city} onChange={(e) => setCity(e.target.value)} disabled={!province} className="input min-h-11" aria-describedby={oldCityNotOnList ? `${idPrefix}-old` : undefined}>
          <option value="" disabled>{province ? "Choose your city or municipality…" : "Choose the province first"}</option>
          {towns.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {oldCityNotOnList && !city && <p id={`${idPrefix}-old`} className="mt-1 text-xs text-muted">You typed &quot;{typed}&quot; before. Please choose it from the list.</p>}
      </div>
    </div>
  );
}
