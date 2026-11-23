import { adminContext } from "@/lib/admin/guard";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import {
  CATEGORIES, DEFAULT_TARGETS, LEVEL_LABEL, parseMoney, parsePct, peso2, pct, SAMPLES, splitCommission, TARGET_NOT_PROMISE, toSplit, withholding,
  MAX_WITHHOLDING_PCT, type Category, type Split, type SplitResult,
} from "@/lib/commission";

export const metadata = { title: "Commission simulator", robots: { index: false } };

type Rule = { id: string; scope: string; partner_category: Category; partner_name: string | null; contract_ref: string | null; national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number; total_pct: number };

function Table({ s, title }: { s: SplitResult; title?: string }) {
  return (
    <div className="overflow-x-auto">
      {title && <p className="mb-1 text-sm font-bold">{title}</p>}
      <table className="w-full text-left text-[15px]">
        <thead className="border-b border-line bg-bg-soft"><tr><th className="px-3 py-2">Level</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
        <tbody>
          {s.lines.map((l) => <tr key={l.level} className="border-b border-line"><td className="px-3 py-2">{LEVEL_LABEL[l.level]}</td><td className="px-3 py-2 text-right">{pct(l.pct)}</td><td className={`whitespace-nowrap px-3 py-2 text-right ${l.amount < 0 ? "text-danger" : ""}`}>{peso2(l.amount)}</td></tr>)}
          <tr className="font-bold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{pct(s.total_pct)}</td><td className={`whitespace-nowrap px-3 py-2 text-right ${s.total < 0 ? "text-danger" : ""}`}>{peso2(s.total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Worked examples and a calculator, with the same centavo rounding as the ledger (the city line takes the rounding). */
export default async function Simulator({ searchParams }: { searchParams: Promise<{ rule?: string; gross?: string; deductions?: string; refund?: string; wh?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const { data } = await ctx.db.from("commission_rules").select("id, scope, partner_category, partner_name, contract_ref, national_pct, regional_pct, provincial_pct, city_pct, total_pct").eq("status", "active").order("scope").limit(500);
  const rules = (data ?? []) as Rule[];
  const defaultOf = (c: Category): Split => { const r = rules.find((x) => x.scope === "default" && x.partner_category === c); return r ? toSplit(r) : DEFAULT_TARGETS[c]; };

  const chosen = rules.find((r) => r.id === sp.rule) ?? rules.find((r) => r.scope === "default" && r.partner_category === "supplier") ?? null;
  const split = chosen ? toSplit(chosen) : DEFAULT_TARGETS.supplier;
  const gross = parseMoney(sp.gross) ?? 100000;
  const ded = Math.min(parseMoney(sp.deductions) ?? 0, gross);
  const net = Math.round((gross - ded) * 100) / 100;
  const refund = Math.min(parseMoney(sp.refund) ?? 0, net);
  const wh = parsePct(sp.wh, MAX_WITHHOLDING_PCT) ?? 0;
  const sale = splitCommission(net, split);
  const back = refund > 0 ? splitCommission(-refund, split) : null;
  const city = sale.lines[3].amount + (back?.lines[3].amount ?? 0);
  const w = withholding(city, wh);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Commission simulator</h1>
        <p className="text-sm text-muted">Try a sale before it happens. Nothing here is saved or paid.</p>
      </div>
      <CommissionTabs current="simulate" national={national} />
      <p className="text-sm">{TARGET_NOT_PROMISE.en} <span className="text-muted" lang="fil">{TARGET_NOT_PROMISE.tl}</span></p>

      <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3"><label htmlFor="rule" className="label">Rate</label>
          <select id="rule" name="rule" defaultValue={chosen?.id ?? ""} className="input min-h-11">
            {rules.map((r) => <option key={r.id} value={r.id}>{r.scope === "default" ? `${CATEGORIES[r.partner_category]} default` : `${r.partner_name} (agreement ${r.contract_ref})`} · {pct(r.total_pct)}</option>)}
          </select>
        </div>
        <div><label htmlFor="gross" className="label">Amount invoiced (₱)</label><input id="gross" name="gross" inputMode="decimal" defaultValue={String(gross)} className="input min-h-11" /></div>
        <div><label htmlFor="deductions" className="label">Less returns, discounts, VAT (₱)</label><input id="deductions" name="deductions" inputMode="decimal" defaultValue={String(ded)} className="input min-h-11" /></div>
        <div><label htmlFor="refund" className="label">Later refund (₱, optional)</label><input id="refund" name="refund" inputMode="decimal" defaultValue={refund ? String(refund) : ""} className="input min-h-11" /></div>
        <div><label htmlFor="wh" className="label">Withholding on the city share (%)</label><input id="wh" name="wh" inputMode="decimal" defaultValue={String(wh)} className="input min-h-11" /></div>
        <div className="flex items-end"><button className="btn btn-flame min-h-11 w-full">Calculate</button></div>
      </form>

      <section className="card space-y-3 p-4" aria-labelledby="res-h">
        <h2 id="res-h" className="text-lg font-bold">Result</h2>
        <p className="text-[15px]">Net qualified sale: {peso2(gross)} less {peso2(ded)} = <strong>{peso2(net)}</strong></p>
        <div className="grid gap-4 lg:grid-cols-3">
          <Table s={sale} title="Commission on the sale" />
          {back && <Table s={back} title={`Refund of ${peso2(refund)} takes back`} />}
          {back && <Table s={{ net: net - refund, total_pct: sale.total_pct, total: Math.round((sale.total + back.total) * 100) / 100, lines: sale.lines.map((l, i) => ({ ...l, amount: Math.round((l.amount + back.lines[i].amount) * 100) / 100 })) }} title="After the refund" />}
        </div>
        <p className="text-[15px]">City or municipal chapter: {peso2(city)} less {pct(wh)} withholding ({peso2(w.withholding)}) = <strong>{peso2(w.net)}</strong> to be sent by MarketplacePH Online Store.</p>
      </section>

      <section className="space-y-3" aria-labelledby="ex-h">
        <h2 id="ex-h" className="text-lg font-bold">Worked examples (category defaults)</h2>
        <ul className="grid gap-3 lg:grid-cols-2">
          {SAMPLES.map((x) => {
            const s = splitCommission(x.gross - x.deductions, defaultOf(x.category));
            const r = x.refund ? splitCommission(-x.refund, defaultOf(x.category)) : null;
            const ww = x.withholdingPct ? withholding(s.lines[3].amount, x.withholdingPct) : null;
            return (
              <li key={x.title} className="card min-w-0 space-y-2 p-4">
                <p className="text-xs font-bold uppercase text-muted">{CATEGORIES[x.category]} · {pct(s.total_pct)}</p>
                <h3 className="text-lg font-extrabold">{x.title}</h3>
                <p className="text-sm text-muted">{x.note}</p>
                <Table s={s} />
                {r && <><p className="text-sm">Refund of {peso2(x.refund)}: {r.lines.map((l) => `${LEVEL_LABEL[l.level]} ${peso2(l.amount)}`).join(", ")}; total {peso2(r.total)}.</p><p className="text-sm font-bold">Commission after the refund: {peso2(s.total + r.total)}</p></>}
                {ww && <p className="text-sm">City share {peso2(s.lines[3].amount)} less {x.withholdingPct}% withholding ({peso2(ww.withholding)}) = <strong>{peso2(ww.net)}</strong>.</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
