import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { LEVEL_LABEL, manilaDay, PAYOUT_STATUS, peso2, pct, WITHHOLDING_HELP, type Level, type PayoutStatus } from "@/lib/commission";
import { preparePayout } from "../actions";

export const metadata = { title: "Commission payouts", robots: { index: false } };

type Balance = { recipient_key: string; recipient_label: string; level: Level; commission: number; paid: number; approved: number; draft: number; open: number; lines: number };
type Payout = { id: string; recipient_key: string; recipient_label: string; period_end: string; line_count: number; total_amount: number; withholding_pct: number; net_amount: number; status: PayoutStatus; paid_on: string | null; mph_reference: string | null; created_at: string };
const FILTERS: [string, string][] = [["waiting", "Waiting"], ["paid", "Paid"], ["cancelled", "Cancelled"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  recipient: "Choose the place.", period: "The period must end today or earlier.", withholding: "Withholding is a percent from 0 to 25.",
  nothing: "There is nothing to pay for that place yet.", missing: "That payout was not found.", failed: "That didn't go through. Please try again.",
};

/** What each place (national, region, province, city or town) is owed, and the payouts finance prepares for MarketplacePH
 *  Online Store to pay. flameph.org never sends money. */
export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; m?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const finance = ctx.roles.some((r) => r === "super_admin" || r === "finance");
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "waiting";
  let q = ctx.db.from("commission_payouts").select("id, recipient_key, recipient_label, period_end, line_count, total_amount, withholding_pct, net_amount, status, paid_on, mph_reference, created_at").order("created_at", { ascending: false }).limit(300);
  if (status === "waiting") q = q.in("status", ["draft", "approved"]);
  else if (status !== "all") q = q.eq("status", status);
  const today = manilaDay();
  const [{ data: bal, error }, { data: list }] = await Promise.all([ctx.db.rpc("commission_balances", { p_from: "2000-01-01", p_to: today }), q]);
  const balances = (bal ?? []) as Balance[];
  const payouts = (list ?? []) as Payout[];
  const busy = new Set(balances.filter((b) => Number(b.draft) !== 0 || Number(b.approved) !== 0).map((b) => b.recipient_key));
  const owed = balances.filter((b) => Number(b.open) !== 0);
  const err = sp.error === "db" ? sp.m ?? ERR.failed : sp.error ? ERR[sp.error] ?? ERR.failed : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Payouts</h1>
        <p className="text-sm text-muted">Finance prepares a payout for one place; a second finance person approves it; after MarketplacePH Online Store pays, finance marks it paid with the payment reference.</p>
      </div>
      <CommissionTabs current="payouts" national={national} />
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {error && <Notice tone="warn">Payouts open after the database update (0034).</Notice>}

      <section className="space-y-3" aria-labelledby="owed-h">
        <h2 id="owed-h" className="text-lg font-bold">Not yet in a payout ({owed.length})</h2>
        {owed.length === 0 ? <Notice tone="info">Nothing is waiting to be paid.</Notice> : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {owed.map((b) => (
              <li key={b.recipient_key} className="card min-w-0 space-y-2 p-4">
                <p className="text-xs font-bold uppercase text-muted">{LEVEL_LABEL[b.level]}</p>
                <p className="break-words text-lg font-extrabold">{b.recipient_label}</p>
                <p className="text-[15px]">Open: <strong className={Number(b.open) < 0 ? "text-danger" : ""}>{peso2(b.open)}</strong> · paid so far {peso2(b.paid)}</p>
                {Number(b.open) < 0 && <p className="text-sm text-danger">Refunds are more than the open commission. It comes off the next payout to this place.</p>}
                {finance && Number(b.open) > 0 && !busy.has(b.recipient_key) && (
                  <form action={preparePayout} className="space-y-2 border-t border-line pt-2">
                    <input type="hidden" name="recipient_key" value={b.recipient_key} />
                    <div className="grid grid-cols-2 gap-2">
                      <div><label htmlFor={`end-${b.recipient_key}`} className="label text-sm">Sales up to</label><input id={`end-${b.recipient_key}`} name="period_end" type="date" required max={today} defaultValue={today} className="input min-h-11" /></div>
                      <div><label htmlFor={`wh-${b.recipient_key}`} className="label text-sm">Withholding %</label><input id={`wh-${b.recipient_key}`} name="withholding_pct" inputMode="decimal" defaultValue="0" className="input min-h-11" /></div>
                    </div>
                    <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Preparing…">Prepare payout</SubmitButton>
                  </form>
                )}
                {busy.has(b.recipient_key) && <p className="text-sm text-muted">A payout for this place is already waiting (see below).</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">{WITHHOLDING_HELP}</p>
      </section>

      <section className="space-y-3" aria-labelledby="list-h">
        <h2 id="list-h" className="text-lg font-bold">Payout records</h2>
        <nav aria-label="Filter payouts" className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(([k, l]) => <Link key={k} href={`/admin/partners/commissions/payouts?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
        </nav>
        {payouts.length === 0 ? <Notice tone="info">Nothing here.</Notice> : (
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {payouts.map((p) => (
              <li key={p.id} className="card min-w-0 p-4">
                <p className="text-xs font-bold uppercase text-muted">Sales up to {day(p.period_end)} · {p.line_count} lines</p>
                <Link href={`/admin/partners/commissions/payouts/${p.id}`} className="block break-words text-lg font-extrabold text-primary underline">{p.recipient_label}</Link>
                <p className="text-[15px]">{peso2(p.total_amount)} less {pct(p.withholding_pct)} withholding = <strong>{peso2(p.net_amount)}</strong></p>
                <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(PAYOUT_STATUS[p.status].tone)}`}>{PAYOUT_STATUS[p.status].label}</span></p>
                {p.status === "paid" && <p className="mt-1 text-sm">Paid {day(p.paid_on)} · ref {p.mph_reference}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
