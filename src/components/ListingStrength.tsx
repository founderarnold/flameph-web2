import { listingStrength, type Listing } from "@/lib/listing";

/** "Your listing is 60% complete", a bar, and the next things to add. Works on server and client pages. */
export function ListingStrength({ biz, supportsExtras = true, max = 3, compact = false }: { biz: Listing | null; supportsExtras?: boolean; max?: number; compact?: boolean }) {
  const { percent, missing } = listingStrength(biz, supportsExtras);
  const tone = percent >= 80 ? "bg-ok" : percent >= 50 ? "bg-gold" : "bg-flame";
  return (
    <div className={compact ? "" : "rounded-xl border border-line bg-bg-soft p-4"}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold">Listing strength</p>
        <p className="text-sm font-bold" aria-hidden>{percent}%</p>
      </div>
      <div role="progressbar" aria-label="Listing strength" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(percent, 4)}%` }} />
      </div>
      {missing.length === 0 ? (
        <p className="mt-2 text-sm text-ok">Your listing is complete. Great work!</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {missing.slice(0, max).map((m) => (
            <li key={m.key} className="flex gap-2"><span aria-hidden className="text-flame-strong">＋</span><span><strong>{m.label}:</strong> <span className="text-muted">{m.tip}</span></span></li>
          ))}
          {missing.length > max && <li className="text-muted">and {missing.length - max} more.</li>}
        </ul>
      )}
    </div>
  );
}
