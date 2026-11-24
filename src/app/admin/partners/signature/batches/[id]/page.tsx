import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import {
  BATCH_COLS, BATCH_FILE_TYPES, BATCH_MOVE_LABEL, BATCH_MOVES, BATCH_STATUS, BATCH_TYPES, QC_RESULT, RECALL_SCOPE, SIGNATURE_ADMIN_ERRORS, SIGNATURE_DONE, type BatchRow,
} from "@/lib/signature";
import { batchStatus, signatureNote } from "../../actions";

export const metadata = { title: "FLAME Signature batch", robots: { index: false } };

type Doc = { id: string; doc_type: keyof typeof BATCH_FILE_TYPES; file_name: string; size_bytes: number; uploaded_at: string };
type Hist = { id: string; action: string; note: string | null; internal: boolean; actor_id: string | null; created_at: string };
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** One batch for the national team: details, traceability, files (logged viewer), licence, and release / hold / reject /
 *  recall with a reason. */
export default async function BatchAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data }, { data: docRows }, { data: histRows }] = await Promise.all([
    ctx.db.from("signature_batches").select(BATCH_COLS).eq("id", id).maybeSingle(),
    ctx.db.from("vetting_documents").select("id, doc_type, file_name, size_bytes, uploaded_at").eq("batch_id", id).eq("purpose", "batch").is("deleted_at", null).order("uploaded_at"),
    ctx.db.from("signature_history").select("id, action, note, internal, actor_id, created_at").eq("batch_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!data) notFound();
  const b = data as unknown as BatchRow;
  const docs = (docRows ?? []) as Doc[];
  const hist = (histRows ?? []) as Hist[];
  const [{ data: prof }, { data: site }, { data: lic }] = await Promise.all([
    b.partner_user_id ? ctx.db.from("partner_profiles").select("legal_name").eq("user_id", b.partner_user_id).maybeSingle() : Promise.resolve({ data: null }),
    b.site_id ? ctx.db.from("signature_sites").select("site_name, place_label, lto_no, lto_valid_until").eq("id", b.site_id).maybeSingle() : Promise.resolve({ data: null }),
    b.licence_id ? ctx.db.from("signature_licences").select("id, ref_no, status, end_date").eq("id", b.licence_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const people = [...new Set(hist.map((h) => h.actor_id).filter(Boolean) as string[])];
  const { data: names } = people.length ? await ctx.db.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const who = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const own = b.partner_user_id === ctx.user.id;
  const moves = BATCH_MOVES[b.status].filter((m) => m !== "released" || b.batch_type === "production");
  const err = sp.error === "db" && sp.m ? `The database refused: ${sp.m}.` : sp.error ? SIGNATURE_ADMIN_ERRORS[sp.error] ?? SIGNATURE_ADMIN_ERRORS.failed : null;
  const done = sp.done === "note" ? "Note saved (team only)." : sp.done ? SIGNATURE_DONE[sp.done] : null;

  return (
    <div className="space-y-4">
      <PartnerTabs current="signature" />
      <p className="text-sm"><Link href="/admin/partners/signature/batches" className="underline">← Batches</Link></p>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{BATCH_TYPES[b.batch_type].label} · {b.ref_no}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{b.product_name} · lot {b.lot_no}</h1>
        <p className="text-sm">{prof?.legal_name ?? "—"}{b.offer_id && <> · <Link href={`/admin/partners/offers/${b.offer_id}`} className="underline">proposal</Link></>}</p>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[BATCH_STATUS[b.status].tone]}`}>{BATCH_STATUS[b.status].label}</span>
      </header>
      {done && <Notice tone="ok">{done}</Notice>}
      {err && <Notice tone="danger">{err}</Notice>}
      {own && <Notice tone="warn">{SIGNATURE_ADMIN_ERRORS.own}</Notice>}
      {b.status_reason && <Notice tone={b.status === "recalled" || b.status === "rejected" ? "danger" : "warn"}>Reason: {b.status_reason}{b.recall_scope ? ` · ${RECALL_SCOPE[b.recall_scope]}` : ""}</Notice>}

      <section className="card space-y-1 p-4" aria-labelledby="d-h">
        <h2 id="d-h" className="text-lg font-bold">Batch details</h2>
        <p className="text-[15px]">Made {day(b.produced_on)} · expires {day(b.expiry_on)} · {b.quantity.toLocaleString("en-PH")} {b.unit}</p>
        <p className="text-[15px]">Manufacturer&apos;s quality check: <strong>{QC_RESULT[b.qc_result]}</strong>{b.qc_note ? ` · ${b.qc_note}` : ""}</p>
        <p className="text-[15px]">Plant: {site ? `${site.site_name}, ${site.place_label} · FDA LTO ${site.lto_no ?? "none"}${site.lto_valid_until ? ` to ${day(site.lto_valid_until)}` : ""}` : "—"}</p>
        <p className="text-[15px]">Licence: {lic ? <Link href={`/admin/partners/signature/licences/${lic.id}`} className="underline">{lic.ref_no} ({lic.status})</Link> : b.batch_type === "production" ? "—" : "not needed (not for sale)"}</p>
        {b.raw_material_lots && <p className="whitespace-pre-line break-words text-[15px]"><span className="font-semibold">Ingredient and packaging lots:</span> {b.raw_material_lots}</p>}
      </section>

      <section className="card p-4" aria-labelledby="f-h">
        <h2 id="f-h" className="text-lg font-bold">Files ({docs.length})</h2>
        <p className="text-sm text-muted">Encrypted. Each opening is logged.</p>
        {docs.length === 0 ? <p className="mt-2 text-sm text-muted">No files. Ask for the certificate of analysis before releasing.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {docs.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block font-semibold">{BATCH_FILE_TYPES[x.doc_type]?.label ?? x.doc_type}</span><span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                {!own && <a href={`/api/vetting/doc/${x.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-11 px-3 text-sm">Open</a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!own && moves.length > 0 && (
        <section id="status" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4" aria-labelledby="st-h">
          <h2 id="st-h" className="text-lg font-bold">Decision</h2>
          {b.batch_type !== "production" && <p className="text-sm text-muted">Sample and pilot batches are never released for sale. You can put them on hold or reject them.</p>}
          <form action={batchStatus} className="space-y-3">
            <input type="hidden" name="id" value={b.id} />
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Change to</legend>
              {moves.map((m) => <label key={m} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft ${m === "recalled" ? "border-danger" : "border-line"}`}><input type="radio" name="to" value={m} required className="check" /><span className="font-semibold">{BATCH_MOVE_LABEL[m]}</span></label>)}
            </fieldset>
            {moves.includes("recalled") && (
              <div className="field">
                <label htmlFor="recall_scope" className="label">Recall level (only for a recall)</label>
                <select id="recall_scope" name="recall_scope" defaultValue="" className="input"><option value="">Choose…</option>{Object.entries(RECALL_SCOPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
            )}
            <div className="field"><label htmlFor="reason" className="label">Reason (needed to hold, reject or recall)</label><textarea id="reason" name="reason" rows={2} maxLength={1000} className="input" /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save decision</SubmitButton>
          </form>
        </section>
      )}

      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="h-h">
        <h2 id="h-h" className="text-lg font-bold">History</h2>
        {hist.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{h.action.replace("_", " ")}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)}{h.actor_id ? ` · ${who.get(h.actor_id) ?? "Team member"}` : ""}</span>
                {h.note && <span className="block whitespace-pre-line break-words">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
        <form action={signatureNote} className="space-y-2 border-t border-line pt-3">
          <input type="hidden" name="batch_id" value={b.id} />
          <label htmlFor="tnote" className="label text-sm">Add a note for the national team</label>
          <textarea id="tnote" name="note" required maxLength={2000} rows={2} className="input" />
          <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
        </form>
      </section>
    </div>
  );
}
