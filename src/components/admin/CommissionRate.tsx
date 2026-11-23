import { LEVELS, MAX_TOTAL_PCT, pct } from "@/lib/commission";

type Rates = { national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number };

export const RULE_ERRORS: Record<string, string> = {
  category: "Choose the category.", pct: "Each level is a percent from 0 to 30, with up to 2 decimals (for example 1 or 0.5).", total: `The four levels together must be more than 0% and at most ${MAX_TOTAL_PCT}%.`,
  date: "Use a real date.", date_order: "The last day must be on or after the first day.", partner: "Choose the accredited partner.", own: "Never for your own business.",
  contract: "Type the signed agreement's number (at least 2 characters).", signed: "The signing date must be a real date, today or earlier.", missing: "That rate was not found.", failed: "That didn't go through. Please try again.",
};

/** The four-level split, in one line: "5% = 1 national + 1 regional + 1 provincial + 2 city". */
export function SplitText({ r }: { r: Rates & { total_pct: number } }) {
  return <><strong>{pct(r.total_pct)}</strong> <span className="text-muted">= {pct(r.national_pct)} national + {pct(r.regional_pct)} regional + {pct(r.provincial_pct)} provincial + {pct(r.city_pct)} city</span></>;
}

export function RateInputs({ d }: { d: Rates }) {
  return (
    <fieldset className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <legend className="label col-span-full">Rate for each level (% of qualified net sales)</legend>
      {LEVELS.map((l) => (
        <div key={l.key}>
          <label htmlFor={`${l.key}_pct`} className="label text-sm">{l.label} <span className="text-muted" lang="fil">({l.fil})</span></label>
          <input id={`${l.key}_pct`} name={`${l.key}_pct`} inputMode="decimal" required defaultValue={String(d[`${l.key}_pct` as keyof typeof d])} className="input min-h-11" />
        </div>
      ))}
    </fieldset>
  );
}

