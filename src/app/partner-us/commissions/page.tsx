import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { CATEGORIES, LEVEL_LABEL, peso2, pct, QUALIFIED_SALE, RECORD_ONLY, TARGET_NOT_PROMISE, type Category, type Level } from "@/lib/commission";

export const metadata = { title: "My commissions", robots: { index: false } };

type Rule = { id: string; scope: "default" | "agreement"; partner_category: Category; contract_ref: string | null; signed_on: string | null; appointment_id: string | null; national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number; total_pct: number; effective_from: string; effective_to: string | null; basis_note: string | null; status: string };
type Entry = { id: string; kind: "sale" | "refund"; partner_category: Category; reference: string; sale_date: string; place_label: string; description: string | null; net_amount: number; total_pct: number; commission_total: number };
type Line = { entry_id: string; level: Level; recipient_label: string; amount: number };
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");

/** The partner's own commission rates and the approved sales and refunds recorded for them. A record only. */
export default async function MyCommissions() {
  const { supabase, user } = await requireUser("/partner-us/commissions");
  const [{ data: prof }, { data: ruleRows, error }, { data: entryRows }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories, legal_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("commission_rules").select("id, scope, partner_category, contract_ref, signed_on, appointment_id, national_pct, regional_pct, provincial_pct, city_pct, total_pct, effective_from, effective_to, basis_note, status").order("effective_from", { ascending: false }).limit(200),
    supabase.from("commission_entries").select("id, kind, partner_category, reference, sale_date, place_label, description, net_amount, total_pct, commission_total").eq("partner_user_id", user.id).order("sale_date", { ascending: false }).limit(200),
  ]);
  const rules = (ruleRows ?? []) as Rule[];
  const entries = (entryRows ?? []) as Entry[];
  const ids = entries.map((e) => e.id);
  const { data: lineRows } = ids.length ? await supabase.from("commission_lines").select("entry_id, level, recipient_label, amount").in("entry_id", ids) : { data: [] };
  const lines = (lineRows ?? []) as Line[];
  const accredited = !!prof && prof.status === "accredited";
  const cats = ((prof?.categories ?? []) as Category[]);
  const mine = rules.filter((r) => r.scope === "agreement");
  const defaults = rules.filter((r) => r.scope === "default" && r.status === "active" && (cats.length === 0 || cats.includes(r.partner_category)));
  const year = new Date(Date.now() + 8 * 3600_000).getUTCFullYear();
  const thisYear = entries.filter((e) => e.sale_date.startsWith(String(year)));
  const sum = (xs: Entry[], k: "net_amount" | "commission_total") => xs.reduce((n, e) => n + Number(e[k]), 0);
  const order: Level[] = ["national", "regional", "provincial", "city"];

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › My commissions</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited partners</p>
        <h1 className="text-3xl font-extrabold text-primary">My commissions</h1>
        <p className="mt-1 text-muted">Your commission rate and the sales and refunds recorded for you, as approved by FLAME PH finance from MarketplacePH Online Store&apos;s reports.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Ang inyong commission rate at ang mga benta at refund na naitala para sa inyo.</p>
      </header>
      <PartnerMoneyNotice />
      {error && <Notice tone="warn">This isn&apos;t available right now. Please try again later.</Notice>}

      <section className="card p-4 sm:p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-bold">How commissions work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6">
          <li>{TARGET_NOT_PROMISE.en} <span className="block text-sm text-muted" lang="fil">{TARGET_NOT_PROMISE.tl}</span></li>
          <li>{QUALIFIED_SALE.en} <span className="block text-sm text-muted" lang="fil">{QUALIFIED_SALE.tl}</span></li>
          <li>The commission is shared by the FLAME PH national office and the regional, provincial and city or town chapters where the order was delivered. A refund takes back the same share.</li>
          <li>{RECORD_ONLY.en} <span className="block text-sm text-muted" lang="fil">{RECORD_ONLY.tl}</span></li>
        </ul>
      </section>

      {!accredited && !error && (
        <section className="card space-y-3 border-2 border-flame p-5" aria-labelledby="not-h">
          <h2 id="not-h" className="text-lg font-bold">First, get accredited</h2>
          <p className="text-[15px] leading-6">Commissions are only for accredited partners. Apply as a supplier, service provider or toll manufacturer first.</p>
          <Link href="/partner-us#apply" className="btn btn-flame min-h-11 w-full sm:w-auto">Apply to become a partner</Link>
        </section>
      )}

      {accredited && <>
        <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="rate-h">
          <h2 id="rate-h" className="text-lg font-bold">Your rate</h2>
          {mine.length === 0 ? <p className="text-[15px]">No signed agreement rate yet. Until there is one, the default below applies to your recorded sales.</p> : (
            <ul className="divide-y divide-line">
              {mine.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="font-bold">{pct(r.total_pct)} · {CATEGORIES[r.partner_category]} · agreement {r.contract_ref}{r.status === "retired" ? " (ended)" : ""}</p>
                  <p className="text-sm">{pct(r.national_pct)} national, {pct(r.regional_pct)} regional, {pct(r.provincial_pct)} provincial, {pct(r.city_pct)} city or town</p>
                  <p className="text-sm text-muted">{day(r.effective_from)} to {r.effective_to ? day(r.effective_to) : "no end date"}{r.appointment_id ? " · for one of your territories" : ""}{r.basis_note ? ` · ${r.basis_note}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
          <h3 className="pt-1 text-sm font-bold uppercase text-muted">Program defaults</h3>
          <ul className="space-y-1 text-[15px]">
            {defaults.map((r) => <li key={r.id}><strong>{CATEGORIES[r.partner_category]}: {pct(r.total_pct)}</strong> <span className="text-sm text-muted">({pct(r.national_pct)} national, {pct(r.regional_pct)} regional, {pct(r.provincial_pct)} provincial, {pct(r.city_pct)} city or town)</span></li>)}
          </ul>
        </section>

        <section className="space-y-3" aria-labelledby="sales-h">
          <h2 id="sales-h" className="text-lg font-bold">Recorded sales and refunds</h2>
          <dl className="grid grid-cols-2 gap-3">
            <div className="card p-3"><dt className="text-xs font-bold uppercase text-muted">Net sales {year}</dt><dd className="text-xl font-extrabold">{peso2(sum(thisYear, "net_amount"))}</dd></div>
            <div className="card p-3"><dt className="text-xs font-bold uppercase text-muted">Commission {year}</dt><dd className="text-xl font-extrabold">{peso2(sum(thisYear, "commission_total"))}</dd></div>
          </dl>
          {entries.length === 0 ? <Notice tone="info">Nothing recorded yet. Sales appear here after FLAME PH finance checks them against MarketplacePH Online Store&apos;s report.</Notice> : (
            <ul className="space-y-3">
              {entries.map((e) => {
                const ls = lines.filter((l) => l.entry_id === e.id).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
                return (
                  <li key={e.id} className="card min-w-0 p-4">
                    <p className="text-xs font-bold uppercase text-muted">{e.kind === "refund" ? "Refund" : "Sale"} · {day(e.sale_date)} · {CATEGORIES[e.partner_category]}</p>
                    <p className="break-words font-bold">Order {e.reference} · {e.place_label}</p>
                    {e.description && <p className="break-words text-sm">{e.description}</p>}
                    <p className="mt-1 text-[15px]">Net {peso2(e.net_amount)} × {pct(e.total_pct)} = <strong className={Number(e.commission_total) < 0 ? "text-danger" : ""}>{peso2(e.commission_total)}</strong></p>
                    {ls.length > 0 && (
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer">Who it goes to</summary>
                        <ul className="mt-1 space-y-0.5">{ls.map((l) => <li key={l.level}>{LEVEL_LABEL[l.level]}: {l.recipient_label} · {peso2(l.amount)}</li>)}</ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </>}
      <PartnerMoneyNotice compact />
    </div>
  );
}
