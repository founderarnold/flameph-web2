import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dateLabel, notExpired, peso } from "@/lib/growth";
import { GROUP_ORDER_PAYMENT_NOTE } from "@/lib/legal-text";
import { joinDeal } from "@/app/account/actions";
import { buttonClass } from "@/components/ui";
import { TabShell } from "@/components/shell/TabShell";

export const metadata = { title: "Group Order" };

type Deal = { id: string; title: string; supplier: string | null; unit: string | null; deal_price: number | null; target_members: number; deadline: string | null; status: string };

/** Group Order tab. In this phase it lists the open buy-together deals (the existing /deals feature); the full Group Order arrives in Phase 10. */
export default async function GroupOrderTab() {
  const { supabase, user } = await requireUser("/group-order");
  const [{ data }, { data: counts }, { data: mine }] = await Promise.all([
    supabase.from("deals").select("id, title, supplier, unit, deal_price, target_members, deadline, status").eq("published", true).neq("status", "closed").order("deadline", { ascending: true, nullsFirst: false }),
    supabase.rpc("deal_counts"),
    supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", user.id),
  ]);
  const deals = (data ?? []) as Deal[];
  const count = new Map(((counts ?? []) as { deal_id: string; members: number }[]).map((c) => [c.deal_id, Number(c.members ?? 0)]));
  const joined = new Map(((mine ?? []) as { deal_id: string; quantity: number }[]).map((m) => [m.deal_id, m.quantity]));
  return (
    <TabShell title="Group Order" fil="Sama-samang pagbili" soon="Starting your own group order arrives in a later update"
      intro="Join other members to buy in bulk at wholesale prices. When you join, you go back to your feed with the group order there.">
      {deals.length === 0 ? (
        <div className="card p-5"><p className="font-semibold">No open group orders right now.</p><p className="mt-1 text-sm text-muted">Tell us what you want to buy together and we will line it up.</p>
          <Link href="/contact" className={`${buttonClass({ variant: "outline" })} mt-3`}>Suggest a group order</Link></div>
      ) : (
        <ul className="space-y-3">
          {deals.map((d) => {
            const open = d.status === "open" && notExpired(d.deadline);
            return (
              <li key={d.id} className="card p-4">
                <h2 className="font-bold">{d.title}</h2>
                <p className="text-sm text-muted">{[d.supplier && `Supplier: ${d.supplier}`, d.deal_price !== null && `${peso(d.deal_price)}${d.unit ? ` / ${d.unit}` : ""}`, d.deadline && `until ${dateLabel(d.deadline)}`].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-sm font-semibold">{count.get(d.id) ?? 0} of {d.target_members} members joined</p>
                {joined.has(d.id) ? (
                  <p className="mt-2 font-semibold text-ok">✓ You reserved {joined.get(d.id)}{d.unit ? ` ${d.unit}` : ""}</p>
                ) : open ? (
                  <form action={joinDeal} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="deal_id" value={d.id} />
                    <div><label className="label text-sm" htmlFor={`qty-${d.id}`}>Quantity{d.unit ? ` (${d.unit})` : ""}</label><input id={`qty-${d.id}`} name="quantity" type="number" min={1} max={10000} defaultValue={1} className="input w-28" /></div>
                    <button className="btn btn-primary">Join</button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-muted">{GROUP_ORDER_PAYMENT_NOTE}</p>
      <Link href="/deals" className="text-sm font-semibold text-primary underline">See full details on Buy Together</Link>
    </TabShell>
  );
}
