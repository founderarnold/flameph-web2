import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { FixedNotice } from "@/components/LegalPage";
import { SubmitButton } from "@/components/SubmitButton";
import { GroupOrderCard } from "@/components/group-order/GroupOrderCard";
import { joinDeal } from "@/app/account/actions";
import { closeGroupOrder, sendGroupOrder } from "@/app/account/group-order-actions";
import { groupOrderMembers, loadGroupOrders } from "@/lib/group-order-data";
import { groupOrderError, manilaToday, minimumReached, stage } from "@/lib/group-order";
import { GROUP_ORDER_PAYMENT_NOTE, NO_MONEY_EN, NO_MONEY_TL } from "@/lib/legal-text";

export const metadata = { title: "Group order", robots: { index: false } };

const DONE: Record<string, string> = {
  sent: "Sent. The supplier can now send terms, and the members who joined were told.",
  closed: "Your group order is closed. Members who joined can see that it closed.",
};

/** One group order: details, who joined, and the organizer's steps (send to the supplier, close). */
export default async function GroupOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const back = `/group-order/${id}`;
  const { supabase, user } = await requireUser(back);
  const { orders, progress, joined, people } = await loadGroupOrders(supabase, user.id, { id, limit: 1 });
  const d = orders[0];
  if (!d) notFound();
  const p = progress.get(d.id);
  const st = stage(d, p);
  const who = await groupOrderMembers(supabase, d.id);
  const organizer = d.created_by === user.id;
  const err = sp.error === "join" ? "That group order isn't open for joining any more." : groupOrderError(sp.error);
  const ready = minimumReached(p?.quantity ?? 0, d.min_quantity);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/group-order" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Group Order</Link>
      {sp.done && DONE[sp.done] && <p role="status" className="rounded-xl bg-ok-soft p-3 text-sm font-semibold text-ok">{DONE[sp.done]}</p>}
      {err && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
      <GroupOrderCard d={d} p={p} mine={joined.get(d.id)} people={people} me={user.id} back={back} detail />
      {d.description && <section aria-label="Details" className="card p-4"><p className="whitespace-pre-line">{d.description}</p></section>}

      {st === "confirmed" && (
        <section aria-label="Reminder"><FixedNotice><p>{NO_MONEY_EN}</p><p lang="fil">{NO_MONEY_TL}</p></FixedNotice></section>
      )}

      {organizer && st === "open" && (
        <section aria-labelledby="go-send" className="card space-y-3 p-4">
          <h2 id="go-send" className="text-lg font-bold">Send to the supplier</h2>
          {ready ? (
            <form action={sendGroupOrder} className="space-y-3">
              <input type="hidden" name="deal_id" value={d.id} />
              <p className="text-sm">This sends one bulk request with the total quantity and the number of members. Joining closes when you send it.</p>
              <div><label htmlFor="needed_by" className="label">Needed by (optional)</label><input id="needed_by" name="needed_by" type="date" min={manilaToday()} className="input" /></div>
              <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">Send the bulk request</SubmitButton>
            </form>
          ) : <p className="text-sm text-muted">You can send it once the minimum quantity is reached. Invite members from your chapter and groups.</p>}
        </section>
      )}

      {d.request_id && (organizer || d.supplier_id === user.id) && (
        <p><Link href={`/requests/${d.request_id}`} className="btn btn-outline min-h-11">{organizer ? "Open the bulk request and the supplier's terms" : "Open the bulk request"}</Link></p>
      )}
      {p?.record_id && <p><Link href={`/records/${p.record_id}`} className="btn btn-outline min-h-11">Open the record</Link></p>}

      <section aria-labelledby="go-who" className="card p-4">
        <h2 id="go-who" className="text-lg font-bold">Who joined ({who.rows.length})</h2>
        {who.rows.length === 0 ? <p className="mt-1 text-sm text-muted">No one yet. Be the first.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {who.rows.map((m) => (
              <li key={m.user_id} className="flex min-h-11 items-center justify-between gap-2 py-2">
                {m.slug ? <Link href={`/members/${m.slug}`} className="inline-flex min-h-11 items-center font-semibold hover:underline">{m.name}</Link> : <span className="font-semibold">{m.name}</span>}
                <span className="shrink-0 text-sm text-muted">{m.is_organizer ? "Organizer · " : ""}{m.quantity.toLocaleString("en-PH")}{d.unit ? ` ${d.unit}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {joined.has(d.id) && !organizer && st === "open" && (
          <form action={joinDeal}><input type="hidden" name="deal_id" value={d.id} /><input type="hidden" name="leave" value="1" /><input type="hidden" name="back" value={back} />
            <button className="btn btn-outline min-h-11">Leave this group order</button></form>
        )}
        {organizer && st !== "closed" && st !== "confirmed" && (
          <form action={closeGroupOrder}><input type="hidden" name="deal_id" value={d.id} /><button className="btn btn-outline min-h-11">Close this group order</button></form>
        )}
      </div>
      <p className="text-sm text-muted">{GROUP_ORDER_PAYMENT_NOTE}</p>
    </div>
  );
}
