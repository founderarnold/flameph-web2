import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { startGroupOrder } from "@/app/account/group-order-actions";
import { memberCards } from "@/lib/people";
import { RECORD_CATEGORIES } from "@/lib/records";
import { GO_DETAILS_MAX, GO_MAX_DAYS, GO_MAX_TARGET, GO_TITLE_MAX, groupOrderError, manilaToday } from "@/lib/group-order";
import { goHref } from "@/lib/ecosystem";

export const metadata = { title: "Start a group order", robots: { index: false } };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Start a group order. "?to=<member>" names a supplier who is a FLAME PH member (from their page). */
export default async function NewGroupOrder({ searchParams }: { searchParams: Promise<{ to?: string; error?: string }> }) {
  const sp = await searchParams;
  const to = sp.to && /^[0-9a-f-]{36}$/i.test(sp.to) ? sp.to : null;
  const { supabase, user } = await requireUser(`/group-order/new${to ? `?to=${to}` : ""}`);
  const supplier = to && to !== user.id ? (await memberCards(supabase, [to])).get(to) : null;
  const err = groupOrderError(sp.error);
  const today = manilaToday();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/group-order" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Group Order</Link>
      <h1 className="text-2xl font-extrabold">Start a group order</h1>
      <p className="text-muted">Signed-in members see it in Group Order and in their feed, and can join with their quantity until the deadline.</p>
      <form action={startGroupOrder} className="card space-y-4 p-4" aria-describedby={err ? "go-error" : undefined}>
        {supplier && <input type="hidden" name="supplier_id" value={to!} />}
        <div>
          <label htmlFor="title" className="label">What do you want to buy together?</label>
          <input id="title" name="title" required minLength={3} maxLength={GO_TITLE_MAX} className="input" placeholder="e.g. Kraft pastry boxes, 8 x 8 in" />
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" required className="input" defaultValue={supplier?.sector && (RECORD_CATEGORIES as readonly string[]).includes(supplier.sector) ? supplier.sector : ""}>
            <option value="" disabled>Choose one</option>
            {RECORD_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="supplier" className="label">Supplier</label>
          {supplier ? <p className="rounded-xl bg-bg-soft p-3 text-sm">The bulk request goes to <b>{supplier.name}</b>, a FLAME PH member.</p>
            : <input id="supplier" name="supplier" maxLength={120} className="input" placeholder="Name of the supplier, if you have one" />}
          {!supplier && <p className="mt-1 text-xs text-muted">Without a member supplier, the bulk request is open to all member suppliers, who can send their terms.</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="unit" className="label">Unit</label><input id="unit" name="unit" maxLength={30} className="input" placeholder="pcs, box, kg" /></div>
          <div><label htmlFor="price" className="label">Target price per unit (₱)</label><input id="price" name="price" inputMode="decimal" maxLength={14} className="input" placeholder="optional" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="min_quantity" className="label">Minimum quantity</label><input id="min_quantity" name="min_quantity" type="number" min={1} max={100000} className="input" placeholder="supplier's MOQ" /></div>
          <div><label htmlFor="target_members" className="label">Members goal</label><input id="target_members" name="target_members" type="number" min={2} max={GO_MAX_TARGET} defaultValue={10} required className="input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="deadline" className="label">Join by</label><input id="deadline" name="deadline" type="date" required min={addDays(today, 1)} max={addDays(today, GO_MAX_DAYS)} defaultValue={addDays(today, 7)} className="input" /></div>
          <div><label htmlFor="quantity" className="label">Your own quantity</label><input id="quantity" name="quantity" type="number" min={1} max={10000} defaultValue={1} required className="input" /></div>
        </div>
        <div>
          <label htmlFor="description" className="label">Details (optional)</label>
          <textarea id="description" name="description" rows={4} maxLength={GO_DETAILS_MAX} className="input" placeholder="Size, color, delivery to one pick-up point, how members pay the supplier…" />
        </div>
        <p className="text-sm text-muted">Each member pays the supplier directly. No money passes through FLAME PH. Walang pera na dumadaan sa FLAME PH.</p>
        {err && <p id="go-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{err}</p>}
        <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Starting…">Start the group order</SubmitButton>
      </form>
      <p className="text-sm">Looking for a supplier first? <Link href={goHref("negosyodepot", "/#/find", "Find suppliers")} className="font-semibold text-primary underline">Find suppliers on NegosyoDepot</Link></p>
    </div>
  );
}
