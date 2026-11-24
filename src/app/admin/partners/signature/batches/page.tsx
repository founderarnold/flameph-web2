import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { BATCH_COLS, BATCH_STATUS, BATCH_TYPES, QC_RESULT, SIGNATURE_ADMIN_ERRORS, type BatchRow } from "@/lib/signature";

export const metadata = { title: "FLAME Signature batches", robots: { index: false } };

const FILTERS: [string, string][] = [["waiting", "Waiting for release"], ["recorded", "Recorded"], ["released", "Released"], ["on_hold", "On hold"], ["rejected", "Rejected"], ["recalled", "Recalled"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** Every batch recorded by toll manufacturers, newest first, filtered by status. Production batches wait here for release. */
export default async function BatchesAdmin({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; lot?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "waiting";
  const lot = (sp.lot ?? "").trim().slice(0, 60);
  let q = ctx.db.from("signature_batches").select(BATCH_COLS).order("created_at", { ascending: false }).limit(300);
  if (status === "waiting") q = q.eq("status", "recorded").eq("batch_type", "production");
  else if (status !== "all") q = q.eq("status", status);
  if (lot) q = q.ilike("lot_no", `%${lot.replace(/[%_\\]/g, "")}%`);
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as BatchRow[];
  const { data: profs } = rows.length ? await ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", [...new Set(rows.map((r) => r.partner_user_id).filter(Boolean) as string[])]) : { data: [] };
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));

  return (
    <div className="space-y-4">
      <PartnerTabs current="signature" />
      <p className="text-sm"><Link href="/admin/partners/signature" className="underline">← FLAME Signature</Link></p>
      <div>
        <h1 className="text-2xl font-extrabold text-primary">FLAME Signature batches</h1>
        <p className="text-sm text-muted">Every lot made under FLAME Signature. Only production batches with a passed quality check, made under an active licence, can be released for sale. Search by lot number to trace a batch.</p>
      </div>
      {sp.error && <Notice tone="danger">{SIGNATURE_ADMIN_ERRORS[sp.error] ?? SIGNATURE_ADMIN_ERRORS.failed}</Notice>}
      {error && <Notice tone="warn">Batches open after the database update (0037).</Notice>}
      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/admin/partners/signature/batches?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
      </nav>
      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="status" value="all" />
        <div className="field sm:w-80"><label htmlFor="lot" className="label text-sm">Lot number</label><input id="lot" name="lot" defaultValue={lot} maxLength={60} className="input" /></div>
        <button type="submit" className="btn btn-outline min-h-11">Find</button>
      </form>
      {rows.length === 0 ? <Notice tone="info">No batches here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((b) => (
            <li key={b.id} className="card space-y-1 p-4">
              <p className="text-xs font-bold uppercase text-muted">{b.ref_no} · {BATCH_TYPES[b.batch_type].label}</p>
              <Link href={`/admin/partners/signature/batches/${b.id}`} className="block break-words text-lg font-extrabold text-primary underline">{b.product_name} · lot {b.lot_no}</Link>
              <p className="break-words text-sm">{(b.partner_user_id && nameOf.get(b.partner_user_id)) ?? "—"}</p>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[BATCH_STATUS[b.status].tone]}`}>{BATCH_STATUS[b.status].label}</span>
              <p className="text-sm text-muted">Made {day(b.produced_on)} · expires {day(b.expiry_on)} · {b.quantity.toLocaleString("en-PH")} {b.unit} · QC {QC_RESULT[b.qc_result].toLowerCase()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
