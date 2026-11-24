import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { LICENCE_COLS, LICENCE_STATUS, SIGNATURE_ADMIN_ERRORS, type LicenceRow } from "@/lib/signature";

export const metadata = { title: "FLAME Signature", robots: { index: false } };

const FILTERS: [string, string][] = [["active", "Active"], ["draft", "Drafts"], ["suspended", "Suspended"], ["ended", "Ended"], ["cancelled", "Cancelled"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** FLAME Signature licences for the national team, with the batches waiting for a decision. A licence names the
 *  approved products, the plants, the manufacturing rights and the distribution rights (separate), and its dates. */
export default async function SignatureAdmin({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "active";
  let q = ctx.db.from("signature_licences").select(LICENCE_COLS).order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);
  const [{ data, error }, { data: all }, { count: waiting }, { count: held }, { count: recalled }] = await Promise.all([
    q, ctx.db.from("signature_licences").select("status").limit(5000),
    ctx.db.from("signature_batches").select("id", { count: "exact", head: true }).eq("status", "recorded").eq("batch_type", "production"),
    ctx.db.from("signature_batches").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
    ctx.db.from("signature_batches").select("id", { count: "exact", head: true }).eq("status", "recalled"),
  ]);
  const rows = (data ?? []) as unknown as LicenceRow[];
  const counts = (all ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <PartnerTabs current="signature" />
      <div>
        <h1 className="text-2xl font-extrabold text-primary">FLAME Signature licences and batches</h1>
        <p className="text-sm text-muted">FLAME PH&apos;s own-brand products made by accredited toll manufacturers. The mark may be used only on approved products, made at licensed plants inside the manufacturing rights, sold only inside the distribution rights, and only on production batches you release.</p>
      </div>
      {sp.error && <Notice tone="danger">{SIGNATURE_ADMIN_ERRORS[sp.error] ?? SIGNATURE_ADMIN_ERRORS.failed}</Notice>}
      {error && <Notice tone="warn">FLAME Signature opens after the database update (0037).</Notice>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/partners/signature/licences/new" className="btn btn-flame min-h-11">New licence</Link>
        <Link href="/admin/partners/signature/batches" className="btn btn-outline min-h-11">Batches{waiting ? ` (${waiting} waiting for release)` : ""}</Link>
        <p className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-center text-sm font-bold ${recalled || held ? "bg-warn-soft text-warn" : "bg-bg-soft text-muted"}`}>{held ?? 0} on hold · {recalled ?? 0} recalled</p>
      </div>

      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/partners/signature?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">
            {l}{k !== "all" && <span className="text-muted"> {counts[k] ?? 0}</span>}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <Notice tone="info">No licences here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((l) => (
            <li key={l.id} className="card space-y-1 p-4">
              <p className="text-xs font-bold uppercase text-muted">{l.ref_no}</p>
              <Link href={`/admin/partners/signature/licences/${l.id}`} className="block break-words text-lg font-extrabold text-primary underline">{l.partner_name}</Link>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[LICENCE_STATUS[l.status].tone]}`}>{LICENCE_STATUS[l.status].label}</span>
              <p className="text-sm">{day(l.start_date)} to {day(l.end_date)}</p>
              <p className="text-sm text-muted">{l.product_ids.length} product(s) · {l.site_ids.length} plant(s) · {l.mfg_appointment_ids.length} manufacturing / {l.dist_appointment_ids.length} distribution right(s)</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
