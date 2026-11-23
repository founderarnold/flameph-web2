import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { ROLE_LABELS } from "@/lib/moderation";
import { LEVEL_LABEL, manilaDay, PAYOUT_STATUS, peso2, pct, WITHHOLDING_HELP, type Level, type PayoutStatus } from "@/lib/commission";
import { movePayout, savePayout } from "../../actions";

export const metadata = { title: "Commission payout", robots: { index: false } };

type Payout = {
  id: string; recipient_key: string; recipient_label: string; chapter_id: string | null; period_end: string; line_count: number; total_amount: number; withholding_pct: number;
  withholding_amount: number; net_amount: number; status: PayoutStatus; prepared_by: string | null; approved_by: string | null; approved_at: string | null; paid_recorded_by: string | null;
  paid_on: string | null; mph_reference: string | null; cancelled_by: string | null; status_reason: string | null; note: string | null; created_at: string;
};
type Line = { id: string; level: Level; pct: number; amount: number; entry_id: string; commission_entries: { kind: string; partner_name: string; reference: string; sale_date: string; net_amount: number } | null };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  status: "That can't be done in the current status.", second: "You prepared this payout. A second finance person must approve it.", negative: "Nothing to pay: refunds are equal to or more than the commission. Cancel it; it carries to the next payout.",
  checked: "Tick the box to confirm you checked the lines.", paid_on: "Give the date MarketplacePH Online Store paid (today or earlier).", mph_reference: "Give MarketplacePH Online Store's payment reference.",
  reason: "Write the reason.", withholding: "Withholding is a percent from 0 to 25.", locked: "Only a payout being prepared can be changed.", failed: "That didn't go through. Please try again.",
};
const DONE: Record<string, string> = {
  prepared: "Prepared. The database added every open line for this place up to the date. A second finance person must approve it.", saved: "Saved.",
  approve: "Approved. Send it to MarketplacePH Online Store to pay; mark it paid here when they confirm.", paid: "Marked paid. It is locked now.", cancel: "Cancelled. Its lines are open again for the next payout.",
};

/** One payout record: the lines in it, withholding, approval and the MarketplacePH Online Store payment reference. */
export default async function PayoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const finance = ctx.roles.some((r) => r === "super_admin" || r === "finance");
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const [{ data: row }, { data: lineRows }, { data: hist }] = await Promise.all([
    ctx.db.from("commission_payouts").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("commission_lines").select("id, level, pct, amount, entry_id, commission_entries(kind, partner_name, reference, sale_date, net_amount)").eq("payout_id", id).limit(5000),
    ctx.db.from("commission_history").select("id, actor_id, action, note, created_at").eq("payout_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!row) notFound();
  const p = row as unknown as Payout;
  const lines = ((lineRows ?? []) as unknown as Line[]).sort((a, b) => (a.commission_entries?.sale_date ?? "").localeCompare(b.commission_entries?.sale_date ?? ""));
  const people = [...new Set([p.prepared_by, p.approved_by, p.paid_recorded_by, p.cancelled_by, ...(hist ?? []).map((h) => h.actor_id)].filter(Boolean) as string[])];
  const [{ data: names }, { data: roleRows }] = people.length ? await Promise.all([
    ctx.db.from("profiles").select("id, full_name").in("id", people), ctx.db.from("roles").select("user_id, role").in("user_id", people),
  ]) : [{ data: [] }, { data: [] }];
  const nameOf = new Map((names ?? []).map((x) => [x.id, x.full_name as string]));
  const roleOf = new Map((roleRows ?? []).map((r) => [r.user_id, ROLE_LABELS[r.role] ?? r.role]));
  const who = (uid: string | null) => (uid ? `${nameOf.get(uid) ?? "Team member"}${roleOf.get(uid) ? ` (${roleOf.get(uid)})` : ""}` : "—");
  const err = sp.error === "db" ? sp.m ?? ERR.failed : sp.error ? ERR[sp.error] ?? ERR.failed : null;
  const mine = p.prepared_by === ctx.user.id;
  const level = p.recipient_key === "national" ? "national" : p.recipient_key.split(":")[0] === "region" ? "regional" : p.recipient_key.split(":")[0] === "province" ? "provincial" : "city";

  return (
    <div className="space-y-4">
      <CommissionTabs current="payouts" national={national} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/commissions/payouts" className="underline">Payouts</Link> › {p.recipient_label}</nav>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{LEVEL_LABEL[level as Level]} · sales up to {day(p.period_end)}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{p.recipient_label}</h1>
        <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(PAYOUT_STATUS[p.status].tone)}`}>{PAYOUT_STATUS[p.status].label}</span></p>
        {p.status_reason && <p className="mt-1 text-sm">Reason: {p.status_reason}</p>}
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card p-4" aria-labelledby="sum-h">
        <h2 id="sum-h" className="sr-only">Totals</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div><dt className="text-xs font-bold uppercase text-muted">Commission ({p.line_count} lines)</dt><dd className="text-xl font-extrabold">{peso2(p.total_amount)}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Withholding {pct(p.withholding_pct)}</dt><dd className="text-xl font-extrabold">{peso2(p.withholding_amount)}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">To be sent by MarketplacePH</dt><dd className="text-xl font-extrabold text-primary">{peso2(p.net_amount)}</dd></div>
          <div><dt className="text-xs font-bold uppercase text-muted">Paid</dt><dd className="text-[15px]">{p.status === "paid" ? `${day(p.paid_on)}, ref ${p.mph_reference}` : "Not yet"}</dd></div>
        </dl>
        <p className="mt-2 text-sm text-muted">Prepared by {who(p.prepared_by)} · {when(p.created_at)}{p.approved_at ? ` · approved by ${who(p.approved_by)} · ${when(p.approved_at)}` : ""}</p>
        {p.note && <p className="mt-1 break-words text-sm">Note: {p.note}</p>}
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="lines-h">
        <h2 id="lines-h" className="text-lg font-bold">Lines in this payout</h2>
        {p.status === "cancelled" ? <p className="text-sm text-muted">Cancelled: its lines went back to &quot;not yet in a payout&quot;.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="border-b border-line bg-bg-soft"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Partner and order</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{day(l.commission_entries?.sale_date ?? null)}</td>
                    <td className="break-words px-3 py-2"><Link href={`/admin/partners/commissions/${l.entry_id}`} className="underline">{l.commission_entries?.partner_name} · {l.commission_entries?.reference}</Link>{l.commission_entries?.kind === "refund" && <span className="block text-xs text-danger">Refund (clawback)</span>}</td>
                    <td className="px-3 py-2 text-right">{peso2(l.commission_entries?.net_amount)}</td>
                    <td className="px-3 py-2 text-right">{pct(l.pct)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${Number(l.amount) < 0 ? "text-danger" : ""}`}>{peso2(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {finance && p.status === "draft" && (
        <details id="edit" className="card scroll-mt-24 p-4">
          <summary className="cursor-pointer text-lg font-bold">Withholding and note</summary>
          <form action={savePayout} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={p.id} />
            <div><label htmlFor="withholding_pct" className="label">Withholding tax %</label><input id="withholding_pct" name="withholding_pct" inputMode="decimal" defaultValue={String(p.withholding_pct)} className="input min-h-11 sm:max-w-xs" /><p className="mt-1 text-xs text-muted">{WITHHOLDING_HELP}</p></div>
            <div><label htmlFor="note" className="label">Note</label><textarea id="note" name="note" maxLength={1000} rows={2} defaultValue={p.note ?? ""} className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>
        </details>
      )}

      {finance && ["draft", "approved"].includes(p.status) && (
        <section id="decide" className="card scroll-mt-24 space-y-4 p-4" aria-labelledby="decide-h">
          <h2 id="decide-h" className="text-lg font-bold">{p.status === "draft" ? "Approve" : "Mark paid"}</h2>
          {p.status === "draft" && (mine ? <Notice tone="info">{ERR.second}</Notice> : (
            <form action={movePayout} className="space-y-2">
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="move" value="approve" />
              <label className="flex min-h-11 items-start gap-2 text-[15px]"><input type="checkbox" name="checked" value="yes" required className="mt-1 size-5" /><span>I checked the lines, the withholding and who receives it. I will ask MarketplacePH Online Store to pay {peso2(p.net_amount)}.</span></label>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Approving…">Approve payout</SubmitButton>
            </form>
          ))}
          {p.status === "approved" && (
            <form action={movePayout} className="space-y-3">
              <input type="hidden" name="id" value={p.id} /><input type="hidden" name="move" value="paid" />
              <p className="text-[15px]">After MarketplacePH Online Store sends the money, record its payment here. flameph.org does not send it.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="paid_on" className="label">Date paid by MarketplacePH Online Store</label><input id="paid_on" name="paid_on" type="date" required max={manilaDay()} className="input min-h-11" /></div>
                <div><label htmlFor="mph_reference" className="label">Their payment reference</label><input id="mph_reference" name="mph_reference" required maxLength={120} className="input min-h-11" placeholder="e.g. MPH-PAY-2026-0042" /></div>
              </div>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Saving…">Mark paid</SubmitButton>
            </form>
          )}
          <form action={movePayout} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={p.id} /><input type="hidden" name="move" value="cancel" />
            <label htmlFor="reason" className="label">Or cancel it (its lines go back to open)</label>
            <textarea id="reason" name="reason" required maxLength={1000} rows={2} className="input" placeholder="Why" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Cancelling…">Cancel payout</SubmitButton>
          </form>
        </section>
      )}

      <section className="card space-y-2 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        <p className="text-xs text-muted">Written by the database. Nobody can change or delete it.</p>
        <ol className="space-y-2">
          {(hist ?? []).map((h) => <li key={h.id} className="text-[15px]"><strong className="capitalize">{h.action}</strong> · {who(h.actor_id)} · {when(h.created_at)}{h.note ? <span className="block break-words text-sm text-muted">{h.note}</span> : null}</li>)}
        </ol>
      </section>
    </div>
  );
}
