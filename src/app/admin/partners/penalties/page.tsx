import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { adminFlash, day, manilaToday, PENALTY_STATUS, peso, when, type PenaltyStatus } from "@/lib/partner-cases";
import { decidePenalty } from "../complaints/actions";

export const metadata = { title: "Partner penalties", robots: { index: false } };

type Row = { id: string; complaint_id: string; partner_name: string; kind: string; affected_value: number; days_late: number | null; rate_pct_per_day: number | null; cap_pct: number | null; amount: number; status: PenaltyStatus; legal_reviewed: boolean; partner_response: string | null; created_at: string; approved_at: string | null; settled_ref: string | null; settled_on: string | null };
const FILTERS: [string, string][] = [["proposed", "Proposed"], ["approved", "Approved, to settle"], ["settled", "Settled"], ["waived", "Waived"], ["cancelled", "Cancelled"], ["all", "All"]];

/** Every proposed and approved penalty. The national team decides on the complaint page; finance records here that
 *  MarketplacePH Online Store settled an approved penalty. A record only. */
export default async function PenaltiesAdmin({ searchParams }: { searchParams: Promise<{ status?: string; done?: string; error?: string; why?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "approved";
  let q = ctx.db.from("partner_penalties").select("id, complaint_id, partner_name, kind, affected_value, days_late, rate_pct_per_day, cap_pct, amount, status, legal_reviewed, partner_response, created_at, approved_at, settled_ref, settled_on").order("created_at", { ascending: false }).limit(500);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  const rows = (data ?? []) as Row[];
  const canSettle = ctx.roles.includes("super_admin") || ctx.roles.includes("finance");
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const flash = adminFlash(sp);
  const total = rows.reduce((n, r) => n + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <PartnerTabs current="penalties" />
      <h1 className="text-2xl font-extrabold text-primary">Partner penalties</h1>
      <PartnerMoneyNotice />
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {error && <Notice tone="warn">Penalties open after the database update (0035).</Notice>}
      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/admin/partners/penalties?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
      </nav>
      <p className="text-sm text-muted">{rows.length} shown · total {peso(total)}</p>
      {rows.length === 0 ? <Notice tone="info">Nothing here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="card space-y-1 p-4 text-sm">
              <p className="text-xs font-bold uppercase text-muted">{PENALTY_STATUS[r.status]}{r.legal_reviewed ? " · legal review done" : ""}</p>
              <p className="text-lg font-extrabold">{peso(r.amount)} · {r.partner_name}</p>
              <p>{r.kind === "late_delivery" ? `Late: ${peso(r.affected_value)} × ${r.rate_pct_per_day}%/day × ${r.days_late} day(s), cap ${r.cap_pct}%` : `Other, on ${peso(r.affected_value)}`}</p>
              <p className="text-muted">Proposed {when(r.created_at)}{r.approved_at ? ` · approved ${when(r.approved_at)}` : ""}{r.settled_ref ? ` · settled ${day(r.settled_on)}, ref ${r.settled_ref}` : ""}</p>
              {r.partner_response && <p><strong>Partner:</strong> {r.partner_response}</p>}
              {national && <Link href={`/admin/partners/complaints/${r.complaint_id}#penalty`} className="underline">Open the complaint</Link>}
              {canSettle && r.status === "approved" && (
                <form action={decidePenalty} className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                  <input type="hidden" name="penalty_id" value={r.id} /><input type="hidden" name="op" value="settle" />
                  <div className="field"><label htmlFor={`sr-${r.id}`} className="label text-sm">MarketplacePH Online Store reference</label><input id={`sr-${r.id}`} name="settled_ref" maxLength={120} required className="input" /></div>
                  <div className="field"><label htmlFor={`so-${r.id}`} className="label text-sm">Settled on</label><input id={`so-${r.id}`} name="settled_on" type="date" max={manilaToday()} required className="input" /></div>
                  <SubmitButton className="btn btn-primary min-h-11" pendingText="Saving…">Record settlement</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
