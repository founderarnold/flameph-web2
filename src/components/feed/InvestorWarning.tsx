import { INVESTOR_WARNING_EN, INVESTOR_WARNING_TL } from "@/lib/legal-text";

/** Investor/funder warning (Community Guidelines section 5). Always shown on such a post and its replies; it has no close button. */
export function InvestorWarning({ compact = false }: { compact?: boolean }) {
  return (
    <div role="note" aria-label="Investor and funder warning" data-fixed-warning="investor"
      className={`space-y-2 rounded-xl border-l-4 border-warn bg-warn-soft p-3 text-fg ${compact ? "text-xs" : "text-sm"}`}>
      <p>{INVESTOR_WARNING_EN}</p>
      <p lang="fil">{INVESTOR_WARNING_TL}</p>
    </div>
  );
}
