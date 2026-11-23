import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { CATEGORIES, ENTRY_STATUS, monthStart, peso2, pct, QUALIFIED_SALE, type Category, type EntryStatus } from "@/lib/commission";

export const metadata = { title: "Commission ledger", robots: { index: false } };

type Row = { id: string; kind: "sale" | "refund"; partner_name: string; partner_category: Category; reference: string; sale_date: string; place_label: string; net_amount: number; total_pct: number | null; commission_total: number | null; status: EntryStatus };
const FILTERS: [string, string][] = [["recorded", "Waiting for approval"], ["approved", "Approved"], ["not_eligible", "Not eligible"], ["void", "Void"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const MSG: Record<string, string> = { missing: "That entry was not found." };

/** The commission ledger for finance and the national team: qualified sales and refunds, as recorded from MarketplacePH
 *  Online Store's reports. A record only. */
export default async function CommissionLedger({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const finance = ctx.roles.some((r) => r === "super_admin" || r === "finance");
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "recorded";
  const q = String(sp.q ?? "").trim().slice(0, 60);
  let list = ctx.db.from("commission_entries").select("id, kind, partner_name, partner_category, reference, sale_date, place_label, net_amount, total_pct, commission_total, status").order("sale_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (status !== "all") list = list.eq("status", status);
  if (q) list = list.or(`reference.ilike.%${q.replace(/[%,()]/g, "")}%,partner_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const from = monthStart();
  const [{ data, error }, { data: all }, { data: month }, { data: open }] = await Promise.all([
    list,
    ctx.db.from("commission_entries").select("status").limit(10000),
    ctx.db.from("commission_entries").select("net_amount, commission_total").eq("status", "approved").gte("sale_date", from).limit(10000),
    ctx.db.from("commission_lines").select("amount, commission_entries!inner(status)").is("payout_id", null).eq("commission_entries.status", "approved").limit(20000),
  ]);
  const rows = (data ?? []) as Row[];
  const counts = (all ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const sum = (xs: { [k: string]: unknown }[] | null, k: string) => (xs ?? []).reduce((n, r) => n + Number(r[k] ?? 0), 0);
  const cards = [
    ["Net sales this month", peso2(sum(month, "net_amount")), "Approved sales less refunds"],
    ["Commission this month", peso2(sum(month, "commission_total")), "All four levels together"],
    ["Waiting for approval", String(counts.recorded ?? 0), "Entries a second finance person must check"],
    ["Not yet in a payout", peso2(sum(open, "amount")), "Approved commission still to be paid"],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Commission ledger</h1>
        <p className="text-sm text-muted">Qualified sales and refunds of accredited partners, copied from MarketplacePH Online Store&apos;s reports. {finance ? "You record them; a second finance person approves." : "You can read the ledger; finance records and approves it."}</p>
      </div>
      <CommissionTabs current="ledger" national={national} />
      {sp.error && <Notice tone="danger">{MSG[sp.error] ?? "That didn't go through."}</Notice>}
      {error && <Notice tone="warn">The commission ledger opens after the database update (0034).</Notice>}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([k, v, h]) => (
          <li key={k} className="card min-w-0 p-3 sm:p-4">
            <p className="text-xs font-bold uppercase text-muted">{k}</p>
            <p className="break-words text-xl font-extrabold text-primary sm:text-2xl">{v}</p>
            <p className="text-xs text-muted">{h}</p>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">{QUALIFIED_SALE.en} <span lang="fil">{QUALIFIED_SALE.tl}</span></p>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end">
        {finance && <Link href="/admin/partners/commissions/new" className="btn btn-flame min-h-11">Record a sale</Link>}
        <form className="flex gap-2" role="search">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="q" className="sr-only">Search by order number or partner</label>
          <input id="q" name="q" defaultValue={q} className="input min-h-11 flex-1" placeholder="Order number or partner" maxLength={60} />
          <button className="btn btn-outline min-h-11">Search</button>
        </form>
      </div>

      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/partners/commissions?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">
            {l}{k !== "all" && <span className="text-muted"> {counts[k] ?? 0}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? <Notice tone="info">{status === "recorded" ? "Nothing waiting. Record a sale from MarketplacePH Online Store's report to start." : "Nothing here."}</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id} className="card min-w-0 p-4">
              <p className="text-xs font-bold uppercase text-muted">{r.kind === "refund" ? "Refund" : "Sale"} · {CATEGORIES[r.partner_category]} · {day(r.sale_date)}</p>
              <Link href={`/admin/partners/commissions/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.partner_name}</Link>
              <p className="break-words text-sm">Order {r.reference} · {r.place_label}</p>
              <p className="mt-1 text-[15px]"><span className="font-bold">{peso2(r.net_amount)}</span> net{r.commission_total !== null && <> · commission <span className="font-bold">{peso2(r.commission_total)}</span> ({pct(r.total_pct)})</>}</p>
              <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(ENTRY_STATUS[r.status].tone)}`}>{ENTRY_STATUS[r.status].label}</span></p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
