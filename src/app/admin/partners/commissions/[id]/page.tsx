import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { PlacePicker } from "@/components/PlacePicker";
import { ROLE_LABELS } from "@/lib/moderation";
import {
  CATEGORIES, ENTRY_ERRORS, ENTRY_STATUS, LEVEL_LABEL, manilaDay, PAYOUT_STATUS, peso2, pct, SALE_CHANNELS, splitCommission, toSplit,
  type Category, type EntryStatus, type Level, type PayoutStatus, type SaleChannel,
} from "@/lib/commission";
import { approveEntry, decideEntry, noteEntry, saveEntry } from "../actions";

export const metadata = { title: "Ledger entry", robots: { index: false } };

type Entry = {
  id: string; kind: "sale" | "refund"; original_id: string | null; partner_user_id: string | null; partner_name: string; partner_category: Category; appointment_id: string | null;
  channel: SaleChannel | null; reference: string; sale_date: string; collected_on: string | null; buyer_name: string | null; city_code: string; place_label: string;
  gross_amount: number; deductions: number; net_amount: number; description: string | null; internal_note: string | null; status: EntryStatus; rule_id: string | null;
  national_pct: number | null; regional_pct: number | null; provincial_pct: number | null; city_pct: number | null; total_pct: number | null; commission_total: number | null;
  recorded_by: string | null; approved_by: string | null; approved_at: string | null; decided_by: string | null; status_reason: string | null; created_at: string;
};
type Line = { id: string; level: Level; recipient_label: string; chapter_id: string | null; pct: number; amount: number; payout_id: string | null };
type Rule = { id: string; scope: string; contract_ref: string | null; national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number; total_pct: number; effective_from: string };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  ...ENTRY_ERRORS, locked: "Only an entry still waiting for approval can be changed. To correct an approved sale, record a refund.", status: "That can't be done in the current status.",
  second: "You recorded this entry. A second finance person must approve it.", checked: "Tick the box to confirm you checked it against MarketplacePH Online Store's report.",
  reason: "Write the reason.",
};
const DONE: Record<string, string> = {
  recorded: "Recorded. A second finance person must now check and approve it.", saved: "Saved.", approved: "Approved. The commission lines were written by the database.",
  not_eligible: "Marked not eligible. It stays in the ledger without commission.", void: "Voided. It stays in the ledger, marked as a mistake.", note: "Note saved (team only).",
};
const ACTION: Record<string, string> = { recorded: "Recorded", refund_recorded: "Refund recorded", approved: "Approved", not_eligible: "Not eligible", void: "Voided" };

/** One sale or refund: the facts, the rate, the four lines and where each is in a payout. Finance approves it here. */
export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const finance = ctx.roles.some((r) => r === "super_admin" || r === "finance");
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const [{ data: row }, { data: lineRows }, { data: hist }, { data: refundRows }] = await Promise.all([
    ctx.db.from("commission_entries").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("commission_lines").select("id, level, recipient_label, chapter_id, pct, amount, payout_id").eq("entry_id", id),
    ctx.db.from("commission_history").select("id, actor_id, action, note, created_at").eq("entry_id", id).order("created_at", { ascending: false }).limit(50),
    ctx.db.from("commission_entries").select("id, reference, sale_date, net_amount, status").eq("original_id", id).order("sale_date"),
  ]);
  if (!row) notFound();
  const e = row as unknown as Entry;
  const order: Level[] = ["national", "regional", "provincial", "city"];
  const lines = ((lineRows ?? []) as Line[]).sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const payoutIds = [...new Set(lines.map((l) => l.payout_id).filter(Boolean) as string[])];
  const people = [...new Set([e.recorded_by, e.approved_by, e.decided_by, ...(hist ?? []).map((h) => h.actor_id)].filter(Boolean) as string[])];
  const recorded = e.status === "recorded";
  // The rate that applies (fixed on approval; before that, the one that would apply today for that sale date).
  const ruleId = e.rule_id ?? (recorded && e.kind === "sale" && e.partner_user_id
    ? ((await ctx.db.rpc("commission_rule_for", { p_partner: e.partner_user_id, p_category: e.partner_category, p_appointment: e.appointment_id, p_date: e.sale_date })).data as string | null)
    : null);
  const [{ data: payouts }, { data: names }, { data: roleRows }, { data: rule }, { data: appt }, { data: original }] = await Promise.all([
    payoutIds.length ? ctx.db.from("commission_payouts").select("id, status").in("id", payoutIds) : Promise.resolve({ data: [] }),
    people.length ? ctx.db.from("profiles").select("id, full_name").in("id", people) : Promise.resolve({ data: [] }),
    people.length ? ctx.db.from("roles").select("user_id, role").in("user_id", people) : Promise.resolve({ data: [] }),
    ruleId ? ctx.db.from("commission_rules").select("id, scope, contract_ref, national_pct, regional_pct, provincial_pct, city_pct, total_pct, effective_from").eq("id", ruleId).maybeSingle() : Promise.resolve({ data: null }),
    e.appointment_id ? ctx.db.from("territorial_appointments").select("id, category_label, status, start_date, end_date").eq("id", e.appointment_id).maybeSingle() : Promise.resolve({ data: null }),
    e.original_id ? ctx.db.from("commission_entries").select("id, reference, sale_date, net_amount").eq("id", e.original_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const payoutStatus = new Map((payouts ?? []).map((p) => [p.id, p.status as PayoutStatus]));
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const roleOf = new Map((roleRows ?? []).map((r) => [r.user_id, ROLE_LABELS[r.role] ?? r.role]));
  const who = (uid: string | null) => (uid ? `${nameOf.get(uid) ?? "Team member"}${roleOf.get(uid) ? ` (${roleOf.get(uid)})` : ""}` : "—");
  const r = rule as Rule | null;
  const preview = r && recorded ? splitCommission(Number(e.net_amount), toSplit(r)) : null;
  const refunded = (refundRows ?? []).filter((x) => x.status !== "void" && x.status !== "not_eligible").reduce((n, x) => n - Number(x.net_amount), 0);
  const err = sp.error === "db" ? sp.m ?? ERR.failed : sp.error ? ERR[sp.error] ?? ERR.failed : null;
  const mine = e.recorded_by === ctx.user.id;
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="space-y-4">
      <CommissionTabs current="ledger" national={national} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/commissions" className="underline">Ledger</Link> › {e.kind === "refund" ? "Refund" : "Sale"} {e.reference}</nav>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{e.kind === "refund" ? "Refund" : "Sale"} · {CATEGORIES[e.partner_category]}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{e.partner_name}</h1>
        <p className="break-words text-[15px]">Order {e.reference}</p>
        <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(ENTRY_STATUS[e.status].tone)}`}>{ENTRY_STATUS[e.status].label}</span></p>
        {e.status_reason && <p className="mt-1 text-sm">Reason: {e.status_reason}</p>}
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card p-4" aria-labelledby="facts-h">
        <h2 id="facts-h" className="sr-only">Facts</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Item k={e.kind === "refund" ? "Refund date" : "Sale date"} v={day(e.sale_date)} />
          <Item k={e.kind === "refund" ? "Money returned on" : "Collected by MarketplacePH on"} v={e.collected_on ? day(e.collected_on) : <span className="font-bold text-warn">Not yet collected</span>} />
          <Item k="Place of delivery" v={e.place_label} />
          <Item k="Channel" v={e.channel ? SALE_CHANNELS[e.channel] : null} />
          <Item k="Buyer" v={e.buyer_name} />
          <Item k="Territory" v={appt ? <Link href={`/admin/partners/territories/${appt.id}`} className="underline">{appt.category_label} ({day(appt.start_date)} to {day(appt.end_date)}, {appt.status})</Link> : "None named"} />
          {e.kind === "sale" ? <>
            <Item k="Amount invoiced" v={peso2(e.gross_amount)} />
            <Item k="Less returns, discounts, VAT" v={peso2(e.deductions)} />
          </> : <Item k="Refund of" v={original ? <Link href={`/admin/partners/commissions/${original.id}`} className="underline">order {original.reference} ({day(original.sale_date)}, net {peso2(original.net_amount)})</Link> : null} />}
          <Item k="Net counted" v={<strong>{peso2(e.net_amount)}</strong>} />
          <Item k="What was sold" v={e.description} />
          <Item k="Recorded by" v={`${who(e.recorded_by)} · ${when(e.created_at)}`} />
          {e.approved_at && <Item k="Approved by" v={`${who(e.approved_by)} · ${when(e.approved_at)}`} />}
        </dl>
      </section>

      {/* ---------------- The rate and the four lines ---------------- */}
      <section className="card space-y-3 p-4" aria-labelledby="lines-h">
        <h2 id="lines-h" className="text-lg font-bold">Commission</h2>
        {r ? <p className="text-[15px]">Rate {recorded ? "that will apply" : "used"}: <strong>{pct(r.total_pct)}</strong> ({r.scope === "agreement" ? `agreement ${r.contract_ref}` : `${CATEGORIES[e.partner_category].toLowerCase()} default`}, from {day(r.effective_from)}). <Link href={`/admin/partners/commissions/rules/${r.id}`} className="underline">See the rate</Link></p>
          : e.status === "recorded" && e.kind === "sale" ? <Notice tone="warn">No rate applies on this sale date. It cannot be approved until a rate covers the date.</Notice> : null}
        {lines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="border-b border-line bg-bg-soft"><tr><th className="px-3 py-2">Level</th><th className="px-3 py-2">Goes to</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Payout</th></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const s = l.payout_id ? payoutStatus.get(l.payout_id) ?? "draft" : "open";
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">{LEVEL_LABEL[l.level]}</td>
                      <td className="break-words px-3 py-2">{l.recipient_label}{!l.chapter_id && l.level !== "national" && <span className="block text-xs text-muted">No chapter open here yet; it waits for one</span>}</td>
                      <td className="px-3 py-2 text-right">{pct(l.pct)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${Number(l.amount) < 0 ? "text-danger" : ""}`}>{peso2(l.amount)}</td>
                      <td className="px-3 py-2 text-sm">{l.payout_id ? <Link href={`/admin/partners/commissions/payouts/${l.payout_id}`} className="underline">{PAYOUT_STATUS[s].label}</Link> : PAYOUT_STATUS.open.label}</td>
                    </tr>
                  );
                })}
                <tr className="bg-bg-soft font-bold"><td className="px-3 py-2" colSpan={2}>Total</td><td className="px-3 py-2 text-right">{pct(e.total_pct)}</td><td className="px-3 py-2 text-right">{peso2(e.commission_total)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        ) : preview ? (
          <div className="rounded-xl border border-dashed border-line p-3">
            <p className="text-sm font-bold">Preview (written by the database on approval)</p>
            <ul className="mt-1 grid gap-1 text-[15px] sm:grid-cols-2">
              {preview.lines.map((l) => <li key={l.level}>{LEVEL_LABEL[l.level]} {pct(l.pct)}: <strong>{peso2(l.amount)}</strong></li>)}
            </ul>
            <p className="mt-1 text-[15px]">Total {pct(preview.total_pct)}: <strong>{peso2(preview.total)}</strong></p>
          </div>
        ) : e.status !== "recorded" ? <p className="text-sm text-muted">No commission: this entry does not count.</p> : null}
      </section>

      {e.kind === "sale" && e.status === "approved" && (
        <section className="card space-y-2 p-4" aria-labelledby="ref-h">
          <h2 id="ref-h" className="text-lg font-bold">Refunds</h2>
          {(refundRows ?? []).length === 0 ? <p className="text-sm text-muted">No refund on this sale.</p> : (
            <ul className="divide-y divide-line">
              {(refundRows ?? []).map((x) => <li key={x.id} className="py-2"><Link href={`/admin/partners/commissions/${x.id}`} className="underline">{x.reference}</Link> · {day(x.sale_date)} · {peso2(x.net_amount)} · {ENTRY_STATUS[x.status as EntryStatus].label}</li>)}
            </ul>
          )}
          <p className="text-sm">Refunded so far: {peso2(refunded)} of {peso2(e.net_amount)}.</p>
          {finance && refunded < Number(e.net_amount) && <Link href={`/admin/partners/commissions/new?refund=${e.id}`} className="btn btn-outline min-h-11 w-full sm:w-auto">Record a refund</Link>}
        </section>
      )}

      {/* ---------------- Decide (finance) ---------------- */}
      {recorded && finance && (
        <section id="decide" className="card scroll-mt-24 space-y-4 p-4" aria-labelledby="decide-h">
          <h2 id="decide-h" className="text-lg font-bold">Check and approve</h2>
          {mine ? <Notice tone="info">{ERR.second}</Notice> : (
            <form action={approveEntry} className="space-y-3">
              <input type="hidden" name="id" value={e.id} />
              <p className="text-[15px]">On approval the database fixes the rate for the sale date, checks the territory (dates, channel, place, excluded accounts) and writes the four lines. After that the entry cannot be changed; a mistake is corrected with a refund.</p>
              <label className="flex min-h-11 items-start gap-2 text-[15px]"><input type="checkbox" name="checked" value="yes" required className="mt-1 size-5" /><span>I checked this against MarketplacePH Online Store&apos;s report: the order is real, collected, and the net amount is right.</span></label>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Approving…">Approve</SubmitButton>
            </form>
          )}
          <form action={decideEntry} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={e.id} />
            <fieldset className="space-y-2">
              <legend className="label">Or: it does not count</legend>
              <label className="flex min-h-11 items-start gap-2"><input type="radio" name="to" value="not_eligible" defaultChecked className="mt-1 size-5" /><span><strong>Not eligible</strong>: a real sale that earns no commission (outside the territory, excluded account, not collected in time…)</span></label>
              <label className="flex min-h-11 items-start gap-2"><input type="radio" name="to" value="void" className="mt-1 size-5" /><span><strong>Void</strong>: recorded by mistake (wrong partner, typing error). The order number can then be recorded again.</span></label>
            </fieldset>
            <label htmlFor="reason" className="label">Reason</label>
            <textarea id="reason" name="reason" required maxLength={1000} rows={2} className="input" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save the decision</SubmitButton>
          </form>
        </section>
      )}

      {recorded && finance && (
        <details id="edit" className="card scroll-mt-24 p-4">
          <summary className="cursor-pointer text-lg font-bold">Correct the facts</summary>
          <form action={saveEntry} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={e.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="e-reference" className="label">Order or refund number</label><input id="e-reference" name="reference" required maxLength={120} defaultValue={e.reference} className="input min-h-11" /></div>
              <div><label htmlFor="e-gross" className="label">{e.kind === "refund" ? "Amount refunded (₱)" : "Amount invoiced (₱)"}</label><input id="e-gross" name="gross_amount" required inputMode="decimal" defaultValue={String(e.gross_amount)} className="input min-h-11" /></div>
              {e.kind === "sale" && <div><label htmlFor="e-ded" className="label">Less returns, discounts and VAT (₱)</label><input id="e-ded" name="deductions" inputMode="decimal" defaultValue={String(e.deductions)} className="input min-h-11" /></div>}
              <div><label htmlFor="e-date" className="label">{e.kind === "refund" ? "Refund date" : "Sale date"}</label><input id="e-date" name="sale_date" type="date" required max={manilaDay()} defaultValue={e.sale_date} className="input min-h-11" /></div>
              <div><label htmlFor="e-coll" className="label">{e.kind === "refund" ? "Money returned on" : "Collected on"}</label><input id="e-coll" name="collected_on" type="date" max={manilaDay()} defaultValue={e.collected_on ?? ""} className="input min-h-11" /></div>
              {e.kind === "sale" && <>
                <div><label htmlFor="e-buyer" className="label">Buyer</label><input id="e-buyer" name="buyer_name" maxLength={200} defaultValue={e.buyer_name ?? ""} className="input min-h-11" /></div>
                <div><label htmlFor="e-channel" className="label">Where it was sold</label><select id="e-channel" name="channel" defaultValue={e.channel ?? ""} className="input min-h-11"><option value="">Not given</option>{Object.entries(SALE_CHANNELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <input type="hidden" name="appointment_id" value={e.appointment_id ?? ""} />
              </>}
            </div>
            {e.kind === "sale" && <><p className="label">Place of delivery</p><PlacePicker defaultCode={e.city_code} /></>}
            <div><label htmlFor="e-desc" className="label">What was sold or refunded</label><input id="e-desc" name="description" maxLength={500} defaultValue={e.description ?? ""} className="input min-h-11" /></div>
            <input type="hidden" name="internal_note" value={e.internal_note ?? ""} />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        </details>
      )}

      <section id="note" className="card scroll-mt-24 space-y-2 p-4" aria-labelledby="note-h">
        <h2 id="note-h" className="text-lg font-bold">Team note</h2>
        {finance ? (
          <form action={noteEntry} className="space-y-2">
            <input type="hidden" name="id" value={e.id} />
            <label htmlFor="internal_note" className="sr-only">Team note</label>
            <textarea id="internal_note" name="internal_note" maxLength={2000} rows={2} defaultValue={e.internal_note ?? ""} className="input" />
            <p className="text-xs text-muted">Only the national team and finance read it. It never changes a figure.</p>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
          </form>
        ) : <p className="break-words text-[15px]">{e.internal_note || <span className="text-muted">None</span>}</p>}
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        <p className="text-xs text-muted">Written by the database. Nobody can change or delete it.</p>
        <ol className="space-y-2">
          {(hist ?? []).map((h) => <li key={h.id} className="text-[15px]"><strong>{ACTION[h.action] ?? h.action}</strong> · {who(h.actor_id)} · {when(h.created_at)}{h.note ? <span className="block break-words text-sm text-muted">{h.note}</span> : null}</li>)}
        </ol>
      </section>
    </div>
  );
}
