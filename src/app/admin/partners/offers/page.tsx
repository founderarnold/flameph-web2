import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { offerResult, OFFER_STATUS, PASS_MARK, PRODUCT_GROUPS, type OfferStatus, type ProductGroup, type ScoreRow } from "@/lib/offers";

export const metadata = { title: "Supplier offers", robots: { index: false } };

type Row = { id: string; user_id: string; status: OfferStatus; revision: number; title: string | null; product_group: ProductGroup | null; valid_until: string | null; submitted_at: string | null; commission_pct: number | null };
const FILTERS: [string, string][] = [["submitted", "Waiting for review"], ["selected", "Best Offers"], ["needs_changes", "Sent back"], ["not_selected", "Not chosen"], ["draft", "Drafts"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const MSG: Record<string, string> = { compare: "Tick 2 to 6 offers to compare them side by side.", missing: "That offer was not found." };

/** Every supplier offer for the national team, filtered by status and product group, with boxes to compare 2 to 6. */
export default async function SupplierOffersAdmin({ searchParams }: { searchParams: Promise<{ status?: string; group?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "submitted";
  const group = sp.group && sp.group in PRODUCT_GROUPS ? (sp.group as ProductGroup) : null;
  let q = ctx.db.from("supplier_offers").select("id, user_id, status, revision, title, product_group, valid_until, submitted_at, commission_pct").order("submitted_at", { ascending: false, nullsFirst: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);
  if (group) q = q.eq("product_group", group);
  const [{ data, error }, { data: all }] = await Promise.all([q, ctx.db.from("supplier_offers").select("status").limit(5000)]);
  const rows = (data ?? []) as Row[];
  const counts = (all ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const ids = rows.map((r) => r.id);
  const users = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: profs }, { data: items }, { data: scores }] = ids.length ? await Promise.all([
    ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", users),
    ctx.db.from("supplier_offer_items").select("offer_id").in("offer_id", ids),
    ctx.db.from("supplier_offer_scores").select("offer_id, reviewer_id, revision, total, compliance_pass").in("offer_id", ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));
  const itemCount = (items ?? []).reduce((m, r) => m.set(r.offer_id, (m.get(r.offer_id) ?? 0) + 1), new Map<string, number>());
  const scoresOf = (id: string) => ((scores ?? []) as (ScoreRow & { offer_id: string })[]).filter((s) => s.offer_id === id);
  const link = (k: string, g: ProductGroup | null) => `/admin/partners/offers?status=${k}${g ? `&group=${g}` : ""}`;

  return (
    <div className="space-y-4">
      <nav aria-label="Partner sections" className="flex gap-2 overflow-x-auto">
        <Link href="/admin/partners" className="chip shrink-0">Applications</Link>
        <Link href="/admin/partners/offers" aria-current="page" className="chip shrink-0">Supplier offers</Link>
      </nav>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Supplier Best Offers</h1>
        <p className="text-sm text-muted">Offers from accredited suppliers. Only the national team sees them; chapter coordinators and testers never see prices or commissions. Pass mark {PASS_MARK}/100 plus the compliance gate.</p>
      </div>
      {sp.error && <Notice tone="danger">{MSG[sp.error] ?? "That didn't go through."}</Notice>}
      {error && <Notice tone="warn">Supplier offers open after the database update (0032).</Notice>}

      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={link(k, group)} aria-current={k === status ? "page" : undefined} className="chip shrink-0">
            {l}{k !== "all" && <span className="text-muted"> {counts[k] ?? 0}</span>}
          </Link>
        ))}
      </nav>
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="status" value={status} />
        <div className="field sm:w-80">
          <label htmlFor="group" className="label text-sm">Product group</label>
          <select id="group" name="group" defaultValue={group ?? ""} className="input">
            <option value="">All product groups</option>
            {Object.entries(PRODUCT_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-outline min-h-11">Show</button>
      </form>

      {rows.length === 0 ? <Notice tone="info">Nothing here.</Notice> : (
        <form method="get" action="/admin/partners/offers/compare" className="space-y-3">
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((r) => {
              const res = offerResult(scoresOf(r.id), r.revision);
              return (
                <li key={r.id} className="card flex gap-3 p-4">
                  <label className="flex min-h-11 min-w-11 cursor-pointer items-start justify-center pt-1">
                    <input type="checkbox" name="id" value={r.id} className="check" aria-label={`Compare ${r.title ?? "offer"}`} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase text-muted">{r.product_group ? PRODUCT_GROUPS[r.product_group] : "No product group"}</p>
                    <Link href={`/admin/partners/offers/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.title || "(no name yet)"}</Link>
                    <p className="break-words text-sm">{nameOf.get(r.user_id) ?? "—"}</p>
                    <p className="mt-1 text-sm"><strong>{OFFER_STATUS[r.status].label}</strong>{r.revision > 0 ? ` · version ${r.revision}` : ""} · {itemCount.get(r.id) ?? 0} product(s) · sent {day(r.submitted_at)}</p>
                    <p className="text-sm text-muted">Score {res.average ?? "—"}{res.scores ? ` (${res.scores} reviewer${res.scores > 1 ? "s" : ""})` : ""} · compliance {res.compliance === "not_checked" ? "not checked" : res.compliance}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-20 z-10 md:bottom-4">
            <button type="submit" className="btn btn-primary min-h-11 w-full shadow-lg sm:w-auto">Compare ticked offers side by side</button>
          </div>
        </form>
      )}
    </div>
  );
}
