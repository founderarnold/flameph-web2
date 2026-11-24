import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PARTNER_DOC_MAX_BYTES } from "@/lib/partner";
import { OFFER_ERRORS } from "@/lib/offers";
import { day, when } from "@/lib/partner-cases";
import {
  BATCH_COLS, BATCH_FILE_TYPES, BATCH_STATUS, BATCH_TYPES, MAX_BATCH_FILES, QC_RESULT, RECALL_SCOPE, SIGNATURE_DONE, SIGNATURE_ERRORS, type BatchRow,
} from "@/lib/signature";
import { deleteBatch, deleteBatchFile, saveBatch, uploadBatchFile } from "../../actions";
import { BatchFields, type Prod, type Site } from "../../BatchFields";

export const metadata = { title: "Batch record", robots: { index: false } };

type Doc = { id: string; doc_type: keyof typeof BATCH_FILE_TYPES; file_name: string; size_bytes: number };
type Hist = { id: string; action: string; note: string | null; created_at: string };
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One batch of the toll manufacturer: details (editable while only "recorded"), files such as the certificate of
 *  analysis, and what the national team decided (released, on hold, rejected, recalled). */
export default async function MyBatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/signature/batches/${id}`);
  const [{ data }, { data: docRows }, { data: histRows }] = await Promise.all([
    supabase.from("signature_batches").select(BATCH_COLS).eq("id", id).eq("partner_user_id", user.id).maybeSingle(),
    supabase.from("vetting_documents").select("id, doc_type, file_name, size_bytes").eq("batch_id", id).eq("user_id", user.id).is("deleted_at", null).order("uploaded_at"),
    supabase.from("signature_history").select("id, action, note, created_at").eq("batch_id", id).eq("internal", false).order("created_at"),
  ]);
  if (!data) notFound();
  const b = data as unknown as BatchRow;
  const docs = (docRows ?? []) as Doc[];
  const hist = (histRows ?? []) as Hist[];
  const editable = b.status === "recorded";
  const canUpload = (b.status === "recorded" || b.status === "on_hold") && docs.length < MAX_BATCH_FILES;
  let products: Prod[] = [];
  let sites: Site[] = [];
  if (editable && b.offer_id) {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("signature_products").select("id, product_name, net_content, site_id, approval, shelf_life_months, offer_id").eq("offer_id", b.offer_id).order("position"),
      supabase.from("signature_sites").select("id, site_name, offer_id").eq("offer_id", b.offer_id).order("position"),
    ]);
    products = (p ?? []) as Prod[];
    sites = (s ?? []) as Site[];
  }
  const err = sp.error ? SIGNATURE_ERRORS[sp.error] ?? OFFER_ERRORS[sp.error] ?? OFFER_ERRORS.failed : null;
  const done = sp.done ? SIGNATURE_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us/signature" className="underline">FLAME Signature</Link> › {b.ref_no}</nav>
      <header>
        <p className="font-display font-bold text-flame-strong">{BATCH_TYPES[b.batch_type].label} · {b.ref_no}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{b.product_name} · lot {b.lot_no}</h1>
        <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[BATCH_STATUS[b.status].tone]}`}>{BATCH_STATUS[b.status].label}</span>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {b.status === "recalled" && (
        <div role="alert"><Notice tone="danger">This batch is RECALLED ({b.recall_scope ? RECALL_SCOPE[b.recall_scope] : ""}). Stop selling and delivering it, and follow your recall plan with the national team. Reason: {b.status_reason}</Notice></div>
      )}
      {(b.status === "on_hold" || b.status === "rejected") && <Notice tone="warn">Reason from the national team: {b.status_reason}</Notice>}

      {editable ? (
        <form id="form" action={saveBatch} className="card scroll-mt-24 space-y-4 p-4 sm:p-6">
          <input type="hidden" name="id" value={b.id} />
          <BatchFields products={products} sites={sites} b={b} />
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save changes</SubmitButton>
        </form>
      ) : (
        <section className="card space-y-1 p-4 sm:p-5" aria-labelledby="det-h">
          <h2 id="det-h" className="text-lg font-bold">Batch details</h2>
          <p className="text-sm">Made {day(b.produced_on)} · expires {day(b.expiry_on)} · {b.quantity.toLocaleString("en-PH")} {b.unit}</p>
          <p className="text-sm">Your quality check: {QC_RESULT[b.qc_result]}{b.qc_note ? ` · ${b.qc_note}` : ""}</p>
          {b.raw_material_lots && <p className="whitespace-pre-line break-words text-sm"><span className="font-semibold">Ingredient and packaging lots:</span> {b.raw_material_lots}</p>}
          <p className="text-xs text-muted">Changed {when(b.status_at)}</p>
        </section>
      )}

      <section id="files" className="card scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="f-h">
        <h2 id="f-h" className="text-lg font-bold">Files <span className="text-sm font-normal text-muted">(up to {MAX_BATCH_FILES}, 4 MB each)</span></h2>
        <p className="text-sm text-muted">The certificate of analysis, lab reports and a photo of the label with the lot number. Files are encrypted; only the national review team can open them.</p>
        {docs.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 break-words"><strong>{BATCH_FILE_TYPES[d.doc_type]?.label ?? d.doc_type}</strong> · {d.file_name} <span className="text-muted">· {kb(d.size_bytes)}</span></span>
                {editable && <form action={deleteBatchFile}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="doc_id" value={d.id} />
                  <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>}
              </li>
            ))}
          </ul>
        )}
        {canUpload && (
          <form action={uploadBatchFile} className="space-y-3">
            <input type="hidden" name="id" value={b.id} />
            <div className="field">
              <label htmlFor="doc_type" className="label">Kind of file</label>
              <select id="doc_type" name="doc_type" required defaultValue="" className="input">
                <option value="" disabled>Choose…</option>
                {Object.entries(BATCH_FILE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="file" className="label">File (PDF, JPG, PNG or WEBP, up to 4 MB)</label>
              <input id="file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="input" data-max-bytes={PARTNER_DOC_MAX_BYTES} />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Add file</SubmitButton>
          </form>
        )}
      </section>

      {hist.length > 0 && (
        <section className="card p-4 sm:p-5" aria-labelledby="h-h">
          <h2 id="h-h" className="text-lg font-bold">History</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {hist.map((h) => <li key={h.id}><span className="text-muted">{when(h.created_at)}</span> · {h.action.replace("_", " ")}{h.note ? `: ${h.note}` : ""}</li>)}
          </ol>
        </section>
      )}

      {editable && (
        <form action={deleteBatch} className="text-right"><input type="hidden" name="id" value={b.id} />
          <SubmitButton className="btn btn-outline min-h-11 text-danger" pendingText="Deleting…">Delete this batch record</SubmitButton></form>
      )}
    </div>
  );
}
