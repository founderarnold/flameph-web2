import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { RateInputs, RULE_ERRORS, SplitText } from "@/components/admin/CommissionRate";
import { CATEGORIES, DEFAULT_TARGETS, manilaDay, pct, RULE_STATUS, TARGET_NOT_PROMISE, type Category, type RuleStatus } from "@/lib/commission";
import { createRule } from "../actions";

export const metadata = { title: "Commission rates", robots: { index: false } };

type Rule = {
  id: string; scope: "default" | "agreement"; partner_category: Category; partner_name: string | null; contract_ref: string | null; signed_on: string | null; appointment_id: string | null;
  national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number; total_pct: number; effective_from: string; effective_to: string | null; status: RuleStatus;
};
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
/** Category defaults (dated versions) and negotiated agreement rates. Only the national team writes them; a second person approves. */
export default async function Rules({ searchParams }: { searchParams: Promise<{ error?: string; m?: string; status?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const [{ data, error }, { data: partners }, { data: appts }, { data: offers }] = await Promise.all([
    ctx.db.from("commission_rules").select("id, scope, partner_category, partner_name, contract_ref, signed_on, appointment_id, national_pct, regional_pct, provincial_pct, city_pct, total_pct, effective_from, effective_to, status").order("effective_from", { ascending: false }).limit(1000),
    national ? ctx.db.from("partner_profiles").select("user_id, legal_name, categories, status").eq("status", "accredited").order("legal_name").limit(1000) : Promise.resolve({ data: [] }),
    national ? ctx.db.from("territorial_appointments").select("id, partner_user_id, category_label, start_date, end_date, status").in("status", ["draft", "active", "suspended"]).limit(1000) : Promise.resolve({ data: [] }),
    national ? ctx.db.from("supplier_offers").select("id, user_id, title, commission_pct, status").in("status", ["selected", "submitted"]).limit(1000) : Promise.resolve({ data: [] }),
  ]);
  const rules = (data ?? []) as Rule[];
  const defaults = rules.filter((r) => r.scope === "default");
  const agreements = rules.filter((r) => r.scope === "agreement" && (sp.status === "all" || r.status !== "cancelled"));
  const partnerList = ((partners ?? []) as { user_id: string; legal_name: string }[]).filter((p) => p.user_id !== ctx.user.id);
  const legal = new Map(partnerList.map((p) => [p.user_id, p.legal_name]));
  const err = sp.error === "db" ? sp.m ?? RULE_ERRORS.failed : sp.error ? RULE_ERRORS[sp.error] ?? RULE_ERRORS.failed : null;
  const today = manilaDay();

  const Card = ({ r }: { r: Rule }) => (
    <li className="card min-w-0 p-4">
      <p className="text-xs font-bold uppercase text-muted">{CATEGORIES[r.partner_category]}{r.scope === "agreement" ? ` · agreement ${r.contract_ref}` : " · default"}</p>
      <Link href={`/admin/partners/commissions/rules/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.scope === "agreement" ? r.partner_name : `${CATEGORIES[r.partner_category]} default`}</Link>
      <p className="text-[15px]"><SplitText r={r} /></p>
      <p className="text-sm text-muted">{day(r.effective_from)} to {r.effective_to ? day(r.effective_to) : "until replaced"}{r.appointment_id ? " · one territory only" : ""}</p>
      <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(RULE_STATUS[r.status].tone)}`}>{RULE_STATUS[r.status].label}</span></p>
    </li>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Commission rates</h1>
        <p className="text-sm text-muted">Each rate is split into four levels: national, regional, provincial and city or municipal, all as a percent of qualified net sales. A sale uses the partner&apos;s signed agreement rate if there is one for that date and territory, otherwise the category default.</p>
      </div>
      <CommissionTabs current="rules" national={national} />
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {error && <Notice tone="warn">Rates open after the database update (0034).</Notice>}
      <Notice tone="info">{TARGET_NOT_PROMISE.en} <span lang="fil">{TARGET_NOT_PROMISE.tl}</span></Notice>

      <section className="space-y-3" aria-labelledby="def-h">
        <h2 id="def-h" className="text-lg font-bold">Category defaults</h2>
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{defaults.filter((r) => r.status !== "cancelled").map((r) => <Card key={r.id} r={r} />)}</ul>
      </section>

      <section className="space-y-3" aria-labelledby="agr-h">
        <h2 id="agr-h" className="text-lg font-bold">Agreement rates ({agreements.length})</h2>
        {agreements.length === 0 ? <Notice tone="info">No negotiated rate yet. Add one when an agreement with a partner is signed with MarketplacePH Online Store.</Notice>
          : <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{agreements.map((r) => <Card key={r.id} r={r} />)}</ul>}
        <Link href={`/admin/partners/commissions/rules?status=${sp.status === "all" ? "" : "all"}`} className="text-sm underline">{sp.status === "all" ? "Hide cancelled drafts" : "Show cancelled drafts too"}</Link>
      </section>

      {national ? (
        <section id="new" className="grid scroll-mt-24 gap-4 lg:grid-cols-2" aria-label="New rates">
          <form action={createRule} className="card space-y-3 p-4 sm:p-5">
            <input type="hidden" name="scope" value="agreement" />
            <h2 className="text-lg font-bold">New agreement rate</h2>
            <p className="text-sm text-muted">From an agreement the partner signed with MarketplacePH Online Store. It applies to that partner&apos;s sales from the first day; with a territory chosen, only to sales under that territory.</p>
            {partnerList.length === 0 ? <Notice tone="info">No accredited partner yet.</Notice> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="partner" className="label">Accredited partner</label><select id="partner" name="partner" required defaultValue="" className="input min-h-11"><option value="" disabled>Choose…</option>{partnerList.map((p) => <option key={p.user_id} value={p.user_id}>{p.legal_name}</option>)}</select></div>
                <div><label htmlFor="a-cat" className="label">As</label><select id="a-cat" name="partner_category" required defaultValue="supplier" className="input min-h-11">{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div><label htmlFor="contract_ref" className="label">Agreement number</label><input id="contract_ref" name="contract_ref" required maxLength={120} className="input min-h-11" placeholder="e.g. MPH-PA-2026-001" /></div>
                <div><label htmlFor="signed_on" className="label">Signed on</label><input id="signed_on" name="signed_on" type="date" required max={today} className="input min-h-11" /></div>
                <div><label htmlFor="a-from" className="label">First day it applies</label><input id="a-from" name="effective_from" type="date" required className="input min-h-11" /></div>
                <div><label htmlFor="a-to" className="label">Last day (optional)</label><input id="a-to" name="effective_to" type="date" className="input min-h-11" /></div>
              </div>
              <div><label htmlFor="appointment_id" className="label">Only for this territory (optional)</label>
                <select id="appointment_id" name="appointment_id" defaultValue="" className="input min-h-11"><option value="">All of this partner&apos;s sales</option>{((appts ?? []) as { id: string; partner_user_id: string; category_label: string; start_date: string | null; end_date: string | null; status: string }[]).filter((a) => legal.has(a.partner_user_id)).map((a) => <option key={a.id} value={a.id}>{legal.get(a.partner_user_id)} · {a.category_label} · {day(a.start_date)} to {day(a.end_date)} ({a.status})</option>)}</select>
              </div>
              <div><label htmlFor="offer_id" className="label">From this Best Offer (optional)</label>
                <select id="offer_id" name="offer_id" defaultValue="" className="input min-h-11"><option value="">None</option>{((offers ?? []) as { id: string; user_id: string; title: string | null; commission_pct: number | null; status: string }[]).filter((o) => legal.has(o.user_id)).map((o) => <option key={o.id} value={o.id}>{legal.get(o.user_id)} · {o.title ?? "Offer"} · proposed {pct(o.commission_pct)}</option>)}</select>
                <p className="mt-1 text-xs text-muted">The commission the supplier proposed in the offer is shown for reference; the signed agreement decides.</p>
              </div>
              <RateInputs d={DEFAULT_TARGETS.supplier} />
              <div><label htmlFor="a-basis" className="label">Basis, as written in the agreement (the partner sees this)</label><input id="a-basis" name="basis_note" maxLength={1000} className="input min-h-11" placeholder="e.g. % of collected net sales, after returns, discounts and VAT" /></div>
              <div><label htmlFor="a-note" className="label">Team note</label><textarea id="a-note" name="internal_note" maxLength={2000} rows={2} className="input" /></div>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Saving…">Save as draft</SubmitButton>
            </>}
          </form>

          <form action={createRule} className="card space-y-3 p-4 sm:p-5">
            <input type="hidden" name="scope" value="default" />
            <h2 className="text-lg font-bold">New default version</h2>
            <p className="text-sm text-muted">Changes a category&apos;s default from a date. Sales before that date keep the old rate. The program&apos;s starting targets: supplier 5% (1, 1, 1, 2), service provider 12% (3, 2, 3, 4), toll manufacturer 8% (2, 1, 2, 3).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="d-cat" className="label">Category</label><select id="d-cat" name="partner_category" required defaultValue="supplier" className="input min-h-11">{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label htmlFor="d-from" className="label">First day it applies</label><input id="d-from" name="effective_from" type="date" required min={today} className="input min-h-11" /></div>
            </div>
            <RateInputs d={DEFAULT_TARGETS.supplier} />
            <div><label htmlFor="d-basis" className="label">Basis (partners see this)</label><input id="d-basis" name="basis_note" maxLength={1000} className="input min-h-11" defaultValue="Percent of qualified collected net sales (after returns, discounts and VAT). A target for negotiation, not a promised payout." /></div>
            <div><label htmlFor="d-note" className="label">Why the change (team note)</label><textarea id="d-note" name="internal_note" maxLength={2000} rows={2} className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save as draft</SubmitButton>
          </form>
        </section>
      ) : <Notice tone="info">Only the national team (founder, admins, national reviewers) sets rates. Finance can read them here.</Notice>}
    </div>
  );
}
