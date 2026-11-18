import Link from "next/link";
import { joinDeal } from "@/app/account/actions";
import { dateLabel, peso } from "@/lib/growth";
import { canJoin, daysLeft, minimumReached, pct, stage, STAGE_TEXT, type GroupOrder, type Progress } from "@/lib/group-order";
import type { MemberCard } from "@/lib/people";
import { NO_MONEY_EN, NO_MONEY_TL } from "@/lib/legal-text";

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(3, value)}%` }} />
    </div>
  );
}

/** One group order: what, who started it, how many joined, the minimum, the deadline, and Join. */
export function GroupOrderCard({ d, p, mine, people, back, me, detail = false }: { d: GroupOrder; p?: Progress; mine?: number; people: Map<string, MemberCard>; back: string; me?: string; detail?: boolean }) {
  const st = stage(d, p);
  const members = p?.members ?? 0;
  const qty = p?.quantity ?? 0;
  const left = daysLeft(d.deadline);
  const organizer = d.created_by ? (d.created_by === me ? "you" : people.get(d.created_by)?.name ?? "a FLAME PH member") : null;
  const supplier = d.supplier_id ? people.get(d.supplier_id)?.name ?? d.supplier : d.supplier;
  return (
    <article id={`deal-${d.id}`} className="card scroll-mt-24 space-y-2 p-4">
      <p className="text-xs font-bold uppercase text-flame-strong">{organizer ? `Started by ${organizer}` : "FLAME PH group order"}{d.category ? ` · ${d.category}` : ""}</p>
      {detail ? <h1 className="text-xl font-extrabold">{d.title}</h1> : <h2 className="text-lg font-bold"><Link href={`/group-order/${d.id}`} className="inline-flex min-h-11 items-center hover:underline">{d.title}</Link></h2>}
      <p className="text-sm text-muted">{[supplier && `Supplier: ${supplier}`, d.deal_price !== null && `${peso(d.deal_price)}${d.unit ? ` / ${d.unit}` : ""}`].filter(Boolean).join(" · ")}</p>
      <div>
        <p className="text-sm font-semibold">{members} of {d.target_members} members joined</p>
        <Bar value={pct(members, d.target_members)} label="Members joined" />
      </div>
      {d.min_quantity && (
        <div>
          <p className="text-sm font-semibold">{qty.toLocaleString("en-PH")} of {d.min_quantity.toLocaleString("en-PH")}{d.unit ? ` ${d.unit}` : ""} minimum{minimumReached(qty, d.min_quantity) ? " · Minimum reached ✓" : ""}</p>
          <Bar value={pct(qty, d.min_quantity)} label="Minimum quantity reached" />
        </div>
      )}
      <p className="text-sm">{d.deadline ? <>Join by <b>{dateLabel(d.deadline)}</b>{left !== null && left >= 0 ? ` (${left === 0 ? "today" : `${left} day${left === 1 ? "" : "s"} left`})` : ""}</> : "No deadline"} · <span className="font-semibold">{STAGE_TEXT[st]}</span></p>
      {mine !== undefined ? (
        <p className="font-semibold text-ok">✓ You joined with {mine.toLocaleString("en-PH")}{d.unit ? ` ${d.unit}` : ""}</p>
      ) : canJoin(st) ? (
        <form action={joinDeal} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="deal_id" value={d.id} /><input type="hidden" name="back" value={back} />
          <div><label className="label text-sm" htmlFor={`qty-${d.id}`}>Quantity{d.unit ? ` (${d.unit})` : ""}</label><input id={`qty-${d.id}`} name="quantity" type="number" min={1} max={10000} defaultValue={1} className="input w-28" /></div>
          <button className="btn btn-primary min-h-11" aria-label={`Join ${d.title}`}>Join</button>
        </form>
      ) : null}
      {st === "confirmed" && !detail && (
        <div aria-label="Reminder" role="note" className="rounded-xl bg-warn-soft p-3 text-sm text-warn"><p>{NO_MONEY_EN}</p><p lang="fil">{NO_MONEY_TL}</p></div>
      )}
      {!detail && <Link href={`/group-order/${d.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">See who joined and details</Link>}
    </article>
  );
}
