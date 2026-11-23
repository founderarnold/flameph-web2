import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { PlacePicker } from "@/components/PlacePicker";
import { CATEGORIES, ENTRY_ERRORS, manilaDay, peso2, QUALIFIED_SALE, SALE_CHANNELS, type Category } from "@/lib/commission";
import { recordEntry } from "../actions";

export const metadata = { title: "Record a sale or refund", robots: { index: false } };


type Partner = { user_id: string; legal_name: string; categories: Category[]; status: string };
type Appt = { id: string; partner_user_id: string; partner_category: Category; category_label: string; status: string; start_date: string | null; end_date: string | null };
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");

/** Finance records one qualified sale, or a refund against an approved sale. A second finance person approves it later. */
export default async function NewEntry({ searchParams }: { searchParams: Promise<{ refund?: string; error?: string; m?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "finance"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const refundOf = sp.refund && /^[0-9a-f-]{36}$/i.test(sp.refund) ? sp.refund : null;
  const err = sp.error === "db" ? sp.m ?? ENTRY_ERRORS.failed : sp.error ? ENTRY_ERRORS[sp.error] ?? ENTRY_ERRORS.failed : null;
  const today = manilaDay();

  if (refundOf) {
    const [{ data: o }, { data: refunds }] = await Promise.all([
      ctx.db.from("commission_entries").select("id, kind, status, partner_name, reference, sale_date, place_label, net_amount, commission_total, total_pct").eq("id", refundOf).maybeSingle(),
      ctx.db.from("commission_entries").select("net_amount").eq("original_id", refundOf).in("status", ["recorded", "approved"]),
    ]);
    const done = (refunds ?? []).reduce((n, r) => n - Number(r.net_amount), 0);
    const left = o ? Number(o.net_amount) - done : 0;
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-primary">Record a refund</h1>
        <CommissionTabs current={null} national={national} />
        {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
        {!o || o.kind !== "sale" || o.status !== "approved" ? <Notice tone="danger">{ENTRY_ERRORS.original}</Notice> : <>
          <section className="card space-y-1 p-4">
            <p className="text-xs font-bold uppercase text-muted">The sale being refunded</p>
            <p className="break-words text-lg font-extrabold">{o.partner_name} · order {o.reference}</p>
            <p className="text-sm">{day(o.sale_date)} · {o.place_label} · net {peso2(o.net_amount)} · commission {peso2(o.commission_total)} ({o.total_pct}%)</p>
            <p className="text-sm">Already refunded: {peso2(done)}. Can still be refunded: <strong>{peso2(left)}</strong>.</p>
          </section>
          <form action={recordEntry} className="card space-y-4 p-4 sm:p-5">
            <input type="hidden" name="kind" value="refund" />
            <input type="hidden" name="original_id" value={o.id} />
            <p className="text-[15px]">The refund takes back the same share from each level and place as the sale, at the sale&apos;s rate. If that commission was already paid, it comes off the next payout to the same place.</p>
            <p className="text-sm text-muted" lang="fil">Ibinabawas ang refund sa parehong mga lugar at sa parehong rate ng benta.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="reference" className="label">Refund or credit memo number</label><input id="reference" name="reference" required maxLength={120} className="input min-h-11" placeholder="e.g. MPH-RF-2026-0007" /></div>
              <div><label htmlFor="gross_amount" className="label">Amount refunded (net, ₱)</label><input id="gross_amount" name="gross_amount" required inputMode="decimal" className="input min-h-11" placeholder={`up to ${left.toFixed(2)}`} /></div>
              <div><label htmlFor="sale_date" className="label">Refund date</label><input id="sale_date" name="sale_date" type="date" required max={today} min={o.sale_date} className="input min-h-11" /></div>
              <div><label htmlFor="collected_on" className="label">Date MarketplacePH Online Store returned the money</label><input id="collected_on" name="collected_on" type="date" max={today} className="input min-h-11" /><p className="mt-1 text-xs text-muted">Needed before approval.</p></div>
            </div>
            <div><label htmlFor="description" className="label">What was refunded (the partner sees this)</label><input id="description" name="description" maxLength={500} className="input min-h-11" placeholder="e.g. 2 cartons damaged in delivery" /></div>
            <div><label htmlFor="internal_note" className="label">Team note (only the national team and finance)</label><textarea id="internal_note" name="internal_note" maxLength={2000} rows={2} className="input" /></div>
            <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Saving…">Record the refund</SubmitButton>
          </form>
        </>}
      </div>
    );
  }

  const [{ data: partners }, { data: appts }] = await Promise.all([
    ctx.db.from("partner_profiles").select("user_id, legal_name, categories, status").order("legal_name").limit(1000),
    ctx.db.from("territorial_appointments").select("id, partner_user_id, partner_category, category_label, status, start_date, end_date").in("status", ["active", "suspended", "ended"]).order("start_date", { ascending: false }).limit(1000),
  ]);
  const list = ((partners ?? []) as Partner[]).filter((p) => p.user_id !== ctx.user.id);
  const name = new Map(list.map((p) => [p.user_id, p.legal_name]));
  const territories = ((appts ?? []) as Appt[]).filter((a) => name.has(a.partner_user_id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Record a sale</h1>
        <p className="text-sm text-muted">One order from MarketplacePH Online Store&apos;s report. It counts only after a second finance person approves it.</p>
      </div>
      <CommissionTabs current={null} national={national} />
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      <p className="text-sm">{QUALIFIED_SALE.en} <span className="text-muted" lang="fil">{QUALIFIED_SALE.tl}</span></p>
      {list.length === 0 ? <Notice tone="info">No accredited partner yet. Sales can be recorded once a partner is accredited.</Notice> : (
        <form action={recordEntry} className="space-y-4">
          <input type="hidden" name="kind" value="sale" />
          <fieldset className="card space-y-3 p-4 sm:p-5">
            <legend className="px-1 text-lg font-bold">Who sold it</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="partner" className="label">Accredited partner</label>
                <select id="partner" name="partner" required className="input min-h-11" defaultValue="">
                  <option value="" disabled>Choose the partner…</option>
                  {list.map((p) => <option key={p.user_id} value={p.user_id}>{p.legal_name}{p.status !== "accredited" ? " (suspended)" : ""}</option>)}
                </select>
              </div>
              <div><label htmlFor="partner_category" className="label">As</label>
                <select id="partner_category" name="partner_category" required className="input min-h-11" defaultValue="supplier">
                  {Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </div>
            <div><label htmlFor="appointment_id" className="label">Under which territory (optional)</label>
              <select id="appointment_id" name="appointment_id" className="input min-h-11" defaultValue="">
                <option value="">No territory: the category default rate or the partner&apos;s agreement applies</option>
                {territories.map((a) => <option key={a.id} value={a.id}>{name.get(a.partner_user_id)} · {a.category_label} · {day(a.start_date)} to {day(a.end_date)}{a.status !== "active" ? ` (${a.status})` : ""}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">With a territory, approval checks the date, channel, place and excluded accounts against it, and its agreed rate applies.</p>
            </div>
            <div><label htmlFor="channel" className="label">Where it was sold</label>
              <select id="channel" name="channel" className="input min-h-11" defaultValue="marketplaceph">
                {Object.entries(SALE_CHANNELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </fieldset>

          <fieldset className="card space-y-3 p-4 sm:p-5">
            <legend className="px-1 text-lg font-bold">The order</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="reference" className="label">MarketplacePH order or invoice number</label><input id="reference" name="reference" required maxLength={120} className="input min-h-11" placeholder="e.g. MPH-2026-001234" /></div>
              <div><label htmlFor="buyer_name" className="label">Buyer (member business)</label><input id="buyer_name" name="buyer_name" maxLength={200} className="input min-h-11" placeholder="As on the order" /></div>
              <div><label htmlFor="sale_date" className="label">Sale date</label><input id="sale_date" name="sale_date" type="date" required max={today} className="input min-h-11" /></div>
              <div><label htmlFor="collected_on" className="label">Date MarketplacePH Online Store collected the payment</label><input id="collected_on" name="collected_on" type="date" max={today} className="input min-h-11" /><p className="mt-1 text-xs text-muted">Leave empty if not yet collected. Only collected sales can be approved.</p></div>
            </div>
            <p className="label">Place of delivery or service</p>
            <PlacePicker />
          </fieldset>

          <fieldset className="card space-y-3 p-4 sm:p-5">
            <legend className="px-1 text-lg font-bold">Amounts</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="gross_amount" className="label">Amount invoiced (₱)</label><input id="gross_amount" name="gross_amount" required inputMode="decimal" className="input min-h-11" placeholder="e.g. 112000" /></div>
              <div><label htmlFor="deductions" className="label">Less returns, discounts and VAT (₱)</label><input id="deductions" name="deductions" inputMode="decimal" className="input min-h-11" placeholder="e.g. 12000" defaultValue="0" /></div>
            </div>
            <p className="text-sm text-muted">The net sale (amount less deductions) is what the commission is counted on. The rate is fixed when the sale is approved.</p>
            <div><label htmlFor="description" className="label">What was sold (the partner sees this)</label><input id="description" name="description" maxLength={500} className="input min-h-11" placeholder="e.g. 500 kraft paper bags, Group Order #12" /></div>
            <div><label htmlFor="internal_note" className="label">Team note (only the national team and finance)</label><textarea id="internal_note" name="internal_note" maxLength={2000} rows={2} className="input" /></div>
          </fieldset>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Saving…">Record the sale</SubmitButton>
            <Link href="/admin/partners/commissions" className="btn btn-outline min-h-11">Back to the ledger</Link>
          </div>
        </form>
      )}
    </div>
  );
}
