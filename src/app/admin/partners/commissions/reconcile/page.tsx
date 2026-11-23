import { Fragment } from "react";
import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { isDay, LEVEL_LABEL, LEVELS, manilaDay, monthStart, peso2, type Level } from "@/lib/commission";

export const metadata = { title: "Commission reconciliation", robots: { index: false } };

type Check = { check_key: string; label: string; expected: number; actual: number; ok: boolean };
type Balance = { recipient_key: string; recipient_label: string; level: Level; commission: number; paid: number; approved: number; draft: number; open: number; lines: number };
const money = new Set(["balance", "commission_total"]);

/** The full reconciliation for a period: the checks that must all pass, totals by level and by place, and a CSV for
 *  MarketplacePH Online Store. Figures are records only. */
export default async function Reconcile({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const from = isDay(sp.from) ? sp.from : monthStart();
  const to = isDay(sp.to) && sp.to >= from ? sp.to : manilaDay();
  const [{ data: checks, error }, { data: bal }, { data: entries }] = await Promise.all([
    ctx.db.rpc("commission_reconcile", { p_from: from, p_to: to }),
    ctx.db.rpc("commission_balances", { p_from: from, p_to: to }),
    ctx.db.from("commission_entries").select("kind, status, gross_amount, deductions, net_amount, commission_total").gte("sale_date", from).lte("sale_date", to).limit(20000),
  ]);
  const list = (checks ?? []) as Check[];
  const balances = (bal ?? []) as Balance[];
  const all = list.length > 0 && list.every((c) => c.ok);
  const ap = (entries ?? []).filter((e) => e.status === "approved");
  const sales = ap.filter((e) => e.kind === "sale");
  const refunds = ap.filter((e) => e.kind === "refund");
  const sum = (xs: Record<string, unknown>[], k: string) => xs.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const waiting = (entries ?? []).filter((e) => e.status === "recorded").length;
  const notCounted = (entries ?? []).filter((e) => e.status === "not_eligible").length;
  const byLevel = LEVELS.map((l) => ({ ...l, rows: balances.filter((b) => b.level === l.key) }));
  const tot = (k: keyof Balance, rows = balances) => rows.reduce((n, b) => n + Number(b[k] ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Reconciliation</h1>
        <p className="text-sm text-muted">Everything approved in the period, checked by the database: every sale&apos;s four lines add up, refunds never exceed a sale, and every peso of commission is either paid, in a payout, or still open.</p>
      </div>
      <CommissionTabs current="reconcile" national={national} />
      {error && <Notice tone="warn">Reconciliation opens after the database update (0034).</Notice>}

      <form className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div><label htmlFor="from" className="label">From (sale date)</label><input id="from" name="from" type="date" defaultValue={from} className="input min-h-11" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={to} max={manilaDay()} className="input min-h-11" /></div>
        <button className="btn btn-outline min-h-11">Show</button>
      </form>

      {!error && <Notice tone={all ? "ok" : "danger"}>{all ? "Reconciled: every check passes for this period." : "A check did not pass. Open the entries and payouts below, and ask for help before paying anything."}</Notice>}

      <section className="card space-y-2 p-4" aria-labelledby="tot-h">
        <h2 id="tot-h" className="text-lg font-bold">Sales in the period</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div><dt className="text-xs font-bold uppercase text-muted">Approved sales ({sales.length})</dt><dd className="text-lg font-extrabold">{peso2(sum(sales, "net_amount"))}</dd><dd className="text-xs text-muted">invoiced {peso2(sum(sales, "gross_amount"))} less {peso2(sum(sales, "deductions"))}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Refunds ({refunds.length})</dt><dd className="text-lg font-extrabold text-danger">{peso2(sum(refunds, "net_amount"))}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Net qualified sales</dt><dd className="text-lg font-extrabold">{peso2(sum(ap, "net_amount"))}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Commission</dt><dd className="text-lg font-extrabold text-primary">{peso2(sum(ap, "commission_total"))}</dd></div>
        </dl>
        <p className="text-sm text-muted">Not counted yet: {waiting} waiting for approval, {notCounted} not eligible.</p>
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="chk-h">
        <h2 id="chk-h" className="text-lg font-bold">Checks</h2>
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.check_key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 text-[15px]">{c.label}</span>
              <span className={`shrink-0 font-bold ${c.ok ? "text-ok" : "text-danger"}`}>{c.ok ? "✓ " : "✗ "}{money.has(c.check_key) ? `${peso2(c.expected)} = ${peso2(c.actual)}` : `${c.actual} found`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="lvl-h">
        <h2 id="lvl-h" className="text-lg font-bold">By level and place</h2>
        {balances.length === 0 ? <p className="text-sm text-muted">No approved commission in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line bg-bg-soft"><tr>{["Place", "Commission", "Paid", "Approved, not paid", "Being prepared", "Not yet in a payout"].map((h, i) => <th key={h} className={`px-3 py-2 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {byLevel.filter((l) => l.rows.length).map((l) => (
                  <Fragment key={l.key}>
                    <tr className="bg-bg-soft/60"><td className="px-3 py-1 text-xs font-bold uppercase text-muted" colSpan={6}>{LEVEL_LABEL[l.key]} · total {peso2(tot("commission", l.rows))}</td></tr>
                    {l.rows.map((b) => (
                      <tr key={b.recipient_key} className="border-b border-line">
                        <td className="break-words px-3 py-2">{b.recipient_label}</td>
                        <td className="px-3 py-2 text-right font-bold">{peso2(b.commission)}</td>
                        <td className="px-3 py-2 text-right">{peso2(b.paid)}</td>
                        <td className="px-3 py-2 text-right">{peso2(b.approved)}</td>
                        <td className="px-3 py-2 text-right">{peso2(b.draft)}</td>
                        <td className={`whitespace-nowrap px-3 py-2 text-right ${Number(b.open) < 0 ? "text-danger" : ""}`}>{peso2(b.open)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                <tr className="font-bold"><td className="px-3 py-2">All places</td>{(["commission", "paid", "approved", "draft", "open"] as const).map((k) => <td key={k} className="px-3 py-2 text-right">{peso2(tot(k))}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
        <a href={`/admin/partners/commissions/export?from=${from}&to=${to}`} className="btn btn-outline min-h-11 w-full sm:w-auto" download>Download lines (CSV) for MarketplacePH Online Store</a>
        <p className="text-xs text-muted">The file lists every approved line in the period with its order number, place, rate, amount and payout status. <Link href="/admin/partners/commissions/payouts" className="underline">Go to payouts</Link></p>
      </section>
    </div>
  );
}
