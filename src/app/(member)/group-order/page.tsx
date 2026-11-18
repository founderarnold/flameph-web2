import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { GROUP_ORDER_PAYMENT_NOTE } from "@/lib/legal-text";
import { buttonClass, Notice } from "@/components/ui";
import { TabShell } from "@/components/shell/TabShell";
import { GroupOrderCard } from "@/components/group-order/GroupOrderCard";
import { loadGroupOrders } from "@/lib/group-order-data";
import { groupOrderError } from "@/lib/group-order";
import { goHref } from "@/lib/ecosystem";

export const metadata = { title: "Group Order" };

/**
 * Group Order tab (bottom tab 1): members gather to buy the same item in bulk, on the existing buy-together deals.
 * Members start group orders, others join with their quantity, and the organizer sends one bulk request to the supplier.
 */
export default async function GroupOrderTab({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/group-order");
  const { ready, orders, progress, joined, people } = await loadGroupOrders(supabase, user.id);
  const mineOnly = sp.view === "mine";
  const list = mineOnly ? orders.filter((o) => o.created_by === user.id || joined.has(o.id)) : orders;
  const err = sp.error === "join" ? "That group order isn't open for joining any more (its deadline passed or it was sent to the supplier)." : groupOrderError(sp.error);
  const tab = (v: string | null, label: string) => (
    <Link href={v ? `/group-order?view=${v}` : "/group-order"} aria-current={(v === "mine") === mineOnly ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${(v === "mine") === mineOnly ? "border-primary bg-primary text-white" : "border-line bg-card"}`}>{label}</Link>
  );
  return (
    <TabShell title="Group Order" fil="Sama-samang pagbili"
      intro="Gather members who want the same item, reach the supplier's minimum together, and get a better price. Each member pays the supplier directly.">
      {ready ? <Link href="/group-order/new" className={buttonClass({ variant: "primary", block: true })}>Start a group order</Link>
        : <Notice tone="info">Starting your own group order opens after FLAME PH finishes a database update. You can join FLAME PH group orders now.</Notice>}
      {err && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
      <nav aria-label="Group orders" className="flex flex-wrap gap-2">{tab(null, "Open now")}{tab("mine", "Mine")}</nav>
      {list.length === 0 ? (
        <div className="card p-5"><p className="font-semibold">{mineOnly ? "You haven't started or joined a group order yet." : "No open group orders right now."}</p>
          <p className="mt-1 text-sm text-muted">Start one: tell members what you want to buy, the minimum the supplier needs and a deadline.</p></div>
      ) : (
        <ul className="space-y-3">
          {list.map((d) => <li key={d.id}><GroupOrderCard d={d} p={progress.get(d.id)} mine={joined.get(d.id)} people={people} me={user.id} back="/group-order" /></li>)}
        </ul>
      )}
      <section aria-labelledby="go-how" className="card p-4">
        <h2 id="go-how" className="text-lg font-bold">How a group order works</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>A member starts it: the item, a minimum quantity and a deadline.</li>
          <li>Members join with how many they want. Everyone sees who joined.</li>
          <li>Once the minimum is reached, the organizer sends one bulk request to the supplier.</li>
          <li>The supplier sends terms. Each member pays the supplier directly. The organizer and supplier confirm it as a record.</li>
        </ol>
        <p className="mt-2 text-sm">Need a supplier? <Link href={goHref("negosyodepot", "/#/find", "Find suppliers")} className="font-semibold text-primary underline">Find suppliers on NegosyoDepot</Link></p>
      </section>
      <p className="text-sm text-muted">{GROUP_ORDER_PAYMENT_NOTE}</p>
      <Link href="/deals" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">FLAME PH Buy Together deals</Link>
    </TabShell>
  );
}
