"use client";
import { useMemo, useState } from "react";
import { PLACES, PROVINCES, SPECIAL_GROUPS, place } from "@/lib/ph-geo";

/**
 * Picks one city or municipality by its official PSGC code: first the province, then the town. Phone first: two big
 * drop-downs, the second narrows to the province chosen. Sends one field with the form: city_code.
 */
export function PlacePicker({ defaultCode = "", required = true }: { defaultCode?: string; required?: boolean }) {
  const start = place(defaultCode);
  const [province, setProvince] = useState(start?.province ?? "");
  const [city, setCity] = useState(start?.code ?? "");
  const provinces = useMemo(() => [
    ...PROVINCES.map((p) => ({ code: p.code, name: p.name })),
    ...Object.entries(SPECIAL_GROUPS).map(([code, name]) => ({ code, name })),
  ].sort((a, b) => a.name.localeCompare(b.name)), []);
  const towns = useMemo(() => (province ? PLACES.filter((c) => c.province === province).sort((a, b) => a.name.localeCompare(b.name)) : []), [province]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="city_code" value={city} />
      <div>
        <label htmlFor="pp-province" className="label">Province</label>
        <select id="pp-province" className="input min-h-11" value={province} onChange={(e) => { setProvince(e.target.value); setCity(""); }} required={required}>
          <option value="">Choose the province…</option>
          {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pp-city" className="label">City or town</label>
        <select id="pp-city" className="input min-h-11" value={city} onChange={(e) => setCity(e.target.value)} required={required} disabled={!province}>
          <option value="">{province ? "Choose the city or town…" : "Choose the province first"}</option>
          {towns.map((t) => <option key={t.code} value={t.code}>{t.name}{t.city ? " (city)" : ""}</option>)}
        </select>
      </div>
    </div>
  );
}
