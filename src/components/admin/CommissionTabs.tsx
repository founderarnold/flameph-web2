import Link from "next/link";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { RECORD_ONLY } from "@/lib/commission";

const TABS = [
  ["ledger", "Ledger", "/admin/partners/commissions"],
  ["payouts", "Payouts", "/admin/partners/commissions/payouts"],
  ["reconcile", "Reconcile", "/admin/partners/commissions/reconcile"],
  ["rules", "Rates", "/admin/partners/commissions/rules"],
  ["simulate", "Simulator", "/admin/partners/commissions/simulate"],
] as const;
export type CommissionTab = (typeof TABS)[number][0];

/** Top of every commission screen: the partner sections (national team only), the commission tabs, and the money notice,
 *  which has no close button and is always shown with the figures. */
export function CommissionTabs({ current, national }: { current: CommissionTab | null; national: boolean }) {
  return (
    <div className="space-y-3">
      {national && <PartnerTabs current="commissions" />}
      <nav aria-label="Commission sections" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([k, l, href]) => <Link key={k} href={href} aria-current={k === current ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
      </nav>
      <PartnerMoneyNotice compact />
      <p className="text-sm text-muted">{RECORD_ONLY.en} <span lang="fil">{RECORD_ONLY.tl}</span></p>
    </div>
  );
}
