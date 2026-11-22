import { MONEY_NOTICE } from "@/lib/offers";

/**
 * The money notice for partner figures (commission proposals now; commissions, penalties and refunds in later steps).
 * Shown wherever such a figure appears, in English and Taglish. It has no close button and cannot be hidden.
 */
export function PartnerMoneyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div role="note" aria-label="Money notice" data-money-notice className={`rounded-xl border-2 border-warn bg-warn-soft text-warn ${compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-[15px]"}`}>
      <p className="font-bold">{MONEY_NOTICE.en}</p>
      <p className="mt-1" lang="fil">{MONEY_NOTICE.tl}</p>
    </div>
  );
}
