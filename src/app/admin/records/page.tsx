import Link from "next/link";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { requireModerator, peopleNames } from "@/lib/moderation-data";
import { MOD_ERRORS } from "@/lib/moderation";
import { voidRecordAdmin } from "@/app/account/moderation-actions";
import { peso, STATUS_LABEL, type RecordStatus, type TxRecord } from "@/lib/records";

export const metadata = { title: "Transaction records" };

const VIEWS: Record<string, { label: string; statuses: RecordStatus[] }> = {
  disputed: { label: "Disputed", statuses: ["disputed"] },
  confirmed: { label: "Confirmed", statuses: ["confirmed"] },
  open: { label: "Not yet confirmed", statuses: ["in_progress", "pending"] },
  voided: { label: "Voided", statuses: ["voided"] },
};

/** Admins and founders: transaction records, newest first, with Void. Disputes are decided in the moderation queue. */
export default async function AdminRecords({ searchParams }: { searchParams: Promise<{ view?: string; done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, available } = await requireModerator("/admin/records", 2);
  if (!available) return <Notice tone="info">Records open after FLAME PH finishes a database update.</Notice>;
  const view = sp.view && sp.view in VIEWS ? sp.view : "disputed";
  const { data, error } = await supabase.from("transaction_records").select("*").in("status", VIEWS[view].statuses).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as TxRecord[];
  const names = await peopleNames(supabase, rows.flatMap((r) => [r.requester_id, r.provider_id]));
  const err = sp.error === "note" ? "Please write a short note on why the record is voided." : sp.error ? MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed : null;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold text-primary">Transaction records</h1>
      <p className="text-sm text-muted">Records count only when both members confirm. Disputes come to the <Link href="/admin/moderation" className="font-semibold text-primary underline">moderation queue</Link>, where you Keep or Void them. You can also void a record here. Voiding takes back the badge level, reputation and points it earned; a founder can undo it from the audit log. You can&apos;t act on your own records.</p>
      {sp.done === "void" && <div role="status"><Notice tone="ok">Record voided and logged.</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      <nav aria-label="Record views" className="flex flex-wrap gap-2 text-sm">
        {Object.entries(VIEWS).map(([k, v]) => (
          <Link key={k} href={`/admin/records?view=${k}`} aria-current={view === k ? "page" : undefined} className={`btn min-h-11 px-3 ${view === k ? "btn-primary" : "btn-outline"}`}>{v.label}</Link>
        ))}
      </nav>
      {error ? <Notice tone="info">Records open after FLAME PH finishes a database update.</Notice> : rows.length === 0 ? <p className="text-muted">Nothing here.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} id={`rec-${r.id}`} className="card scroll-mt-24 space-y-2 p-4">
              <p className="text-xs text-muted">{r.deal_date} · {r.category} · {STATUS_LABEL[r.status]}</p>
              <Link href={`/records/${r.id}`} className="block font-bold hover:underline">{r.description}</Link>
              <p className="text-sm">{names.get(r.requester_id) ?? "Member"} (buyer) and {names.get(r.provider_id) ?? "Member"} (seller){peso(r.amount) ? ` · amount typed: ${peso(r.amount)}` : ""}</p>
              {r.void_note && <p className="text-sm text-muted">Void note: {r.void_note}</p>}
              {r.status !== "voided" && r.status !== "cancelled" && (
                <details className="rounded-xl border border-line p-3">
                  <summary className="min-h-11 cursor-pointer content-center font-semibold">Void this record</summary>
                  <form action={voidRecordAdmin} className="mt-2 space-y-2">
                    <input type="hidden" name="record_id" value={r.id} />
                    <label htmlFor={`note-${r.id}`} className="label">Why? (both members can see this note)</label>
                    <input id={`note-${r.id}`} name="note" required minLength={3} maxLength={500} className="input" />
                    <SubmitButton className="btn btn-danger min-h-11" pendingText="Voiding…">Yes, void it</SubmitButton>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
