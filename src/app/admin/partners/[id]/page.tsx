import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  COVERAGE, DETAIL_FIELDS, formatTinMasked, missingItems, PARTNER_CATEGORIES, PARTNER_DOC_TYPES, REASON_KEYS, REASONS, REGISTRATION_TYPES,
  requiredDocs, shown, STATUS, type AppRow,
} from "@/lib/partner";
import { openTin } from "@/lib/partner-server";
import { ROLE_LABELS } from "@/lib/moderation";
import { decideApplication, markDocument } from "../actions";

export const metadata = { title: "Partner application", robots: { index: false } };

type Doc = { id: string; doc_type: string; file_name: string; size_bytes: number; mime: string; uploaded_at: string; review_status: string | null; key_id: string };
type Review = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number; internal: boolean; actor_id: string | null };
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ERR: Record<string, string> = {
  reasons: "Choose at least one reason so the applicant knows what to fix.", note: "You chose \"Other reason\": please write a note.",
  own: "You can't review your own business.", status: "Only an application waiting for review can be decided.", decision: "Choose a decision.",
  missing: "Not found.", failed: "That didn't go through. Please try again.",
};
const DONE: Record<string, string> = { decided: "Decision saved. The applicant was told in their Inbox and by email.", marked: "Document mark saved." };
const ACTION: Record<string, string> = { submitted: "Sent by applicant", needs_changes: "Asked for changes", approved: "Approved", rejected: "Not approved", withdrawn: "Withdrawn by applicant", reopened: "Reopened by applicant", doc_checked: "Document checked", chapter_note: "Chapter coordinator note" };

/** One application for the national team: answers, documents (opened through the logged viewer), TIN on request (logged), history and the decision. */
export default async function PartnerReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tin?: string; done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data: row }, { data: docRows }, { data: revRows }] = await Promise.all([
    ctx.db.from("partner_applications").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("vetting_documents").select("id, doc_type, file_name, size_bytes, mime, uploaded_at, review_status, key_id").eq("application_id", id).eq("purpose", "partner").is("deleted_at", null).order("uploaded_at"),
    ctx.db.from("partner_reviews").select("id, action, reasons, note, created_at, revision, internal, actor_id").eq("application_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!row) notFound();
  const a = row as AppRow & { user_id: string; tin_enc: string | null; tin_key_id: string | null; chapter_id: string | null };
  const docs = (docRows ?? []) as Doc[];
  const history = (revRows ?? []) as Review[];
  const own = a.user_id === ctx.user.id;
  const d = a.details ?? {};
  const [{ data: prof }, { data: chapter }, actorRoles] = await Promise.all([
    ctx.db.from("profiles").select("full_name, member_code").eq("id", a.user_id).maybeSingle(),
    a.chapter_id ? ctx.db.from("chapters").select("name").eq("id", a.chapter_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("roles").select("user_id, role").in("user_id", [...new Set(history.map((h) => h.actor_id).filter(Boolean) as string[])]),
  ]);
  const roleOf = new Map((actorRoles.data ?? []).map((r) => [r.user_id, ROLE_LABELS[r.role] ?? r.role]));

  // The TIN is shown only when asked, never to the applicant's own reviewer account, and each view is logged.
  let tin: string | null = null;
  if (sp.tin === "1" && !own && a.tin_enc) {
    tin = openTin(a.tin_enc, a.tin_key_id);
    await ctx.audit("partner_tin_viewed", "partner_applications", id);
  }
  const missing = missingItems(a, docs.map((x) => x.doc_type));
  const need = requiredDocs(a.category, d);

  const Item = ({ k, v }: { k: string; v?: string | null }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link href="/admin/partners" className="underline">← Partner applications</Link></p>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{PARTNER_CATEGORIES[a.category].label} · version {a.revision}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{a.legal_name || "(no name yet)"}</h1>
        <p className="text-sm">Status: <strong>{STATUS[a.status].label}</strong> · sent {when(a.submitted_at)} · member {prof?.full_name ?? "—"} ({prof?.member_code ?? "—"}){chapter ? ` · ${chapter.name}` : ""}</p>
      </header>
      {sp.done && <Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice>}
      {sp.error && <Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice>}
      {own && <Notice tone="warn">This is your own application. Another member of the national team must review it.</Notice>}

      <section className="card p-4" aria-labelledby="biz-h">
        <h2 id="biz-h" className="text-lg font-bold">Business and contact</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item k="Registered name" v={a.legal_name} /><Item k="Brand or store name" v={a.trade_name} />
          <Item k="Registration" v={a.registration_type ? `${REGISTRATION_TYPES[a.registration_type as keyof typeof REGISTRATION_TYPES]} · ${a.registration_no ?? ""}` : null} />
          <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">TIN</dt><dd>
            {tin ? <span className="font-mono">{tin}</span> : <>{formatTinMasked(a.tin_last3) || "—"} {a.tin_enc && !own && <Link href={`/admin/partners/${id}?tin=1`} className="ml-2 text-sm font-semibold text-primary underline">Show full TIN (logged)</Link>}</>}
          </dd></div>
          <Item k="Industry" v={a.industry} /><Item k="Website" v={a.website} />
          <Item k="Representative" v={[a.rep_name, a.rep_position].filter(Boolean).join(", ")} /><Item k="Business email" v={a.biz_email} />
          <Item k="Business phone" v={a.biz_phone} /><Item k="Address" v={[a.address_line, a.city, a.province].filter(Boolean).join(", ")} />
          <Item k="Area served" v={a.coverage ? `${COVERAGE[a.coverage as keyof typeof COVERAGE]}${a.coverage_areas ? `: ${a.coverage_areas}` : ""}` : null} />
        </dl>
      </section>

      <section className="card p-4" aria-labelledby="det-h">
        <h2 id="det-h" className="text-lg font-bold">What they offer</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {DETAIL_FIELDS[a.category].filter((f) => shown(f, d)).map((f) => <Item key={f.name} k={f.label} v={d[f.name]} />)}
        </dl>
      </section>

      <section id="docs" className="card scroll-mt-24 p-4" aria-labelledby="docs-h">
        <h2 id="docs-h" className="text-lg font-bold">Documents</h2>
        <p className="text-sm text-muted">Needed: {need.map((t) => PARTNER_DOC_TYPES[t].label).join(", ")}. Each opening is logged.</p>
        {docs.length === 0 ? <p className="mt-2 text-sm text-muted">No files.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {docs.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block font-semibold">{PARTNER_DOC_TYPES[x.doc_type as keyof typeof PARTNER_DOC_TYPES]?.label ?? x.doc_type}
                    {x.review_status && <span className={`ml-2 rounded-full px-2 text-xs font-bold ${x.review_status === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{x.review_status === "ok" ? "OK" : "Problem"}</span>}</span>
                  <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span>
                </span>
                {!own && (
                  <span className="flex flex-wrap gap-2">
                    <a href={`/api/vetting/doc/${x.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-11 px-3 text-sm">Open</a>
                    {(["ok", "problem"] as const).map((m) => (
                      <form key={m} action={markDocument}><input type="hidden" name="id" value={id} /><input type="hidden" name="doc_id" value={x.id} /><input type="hidden" name="mark" value={m} />
                        <SubmitButton className={`btn min-h-11 px-3 text-sm ${m === "ok" ? "btn-outline" : "btn-outline text-danger"}`} pendingText="Saving…">{m === "ok" ? "Mark OK" : "Mark problem"}</SubmitButton></form>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {a.status === "submitted" && !own && (
        <section className="card space-y-3 border-2 border-primary p-4" aria-labelledby="dec-h">
          <h2 id="dec-h" className="text-lg font-bold">Decision</h2>
          {missing.length > 0 && <Notice tone="warn">Something required is now missing: {missing.map((m) => m.what).join(", ")}.</Notice>}
          <form action={decideApplication} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="label">What do you decide?</legend>
              {([["approved", "Approve (accredit)"], ["needs_changes", "Send back for changes"], ["rejected", "Not approved"]] as const).map(([v, l]) => (
                <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="decision" value={v} required className="check" /><span className="font-semibold">{l}</span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="label">Reasons the applicant will see (needed for changes or not approved)</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {REASON_KEYS.map((k) => (
                  <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 py-1"><input type="checkbox" name="reasons" value={k} className="check mt-0.5" /><span className="text-[15px]">{REASONS[k]}</span></label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="note" className="label">Note to the applicant (optional; needed with &quot;Other reason&quot;)</label>
              <textarea id="note" name="note" rows={3} maxLength={2000} className="input" placeholder="e.g. Please upload your 2026 Mayor's permit; the one sent expired in January." />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save decision</SubmitButton>
          </form>
        </section>
      )}

      <section className="card p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        {history.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="mt-2 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{ACTION[h.action] ?? h.action}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)} · version {h.revision}{h.actor_id && h.actor_id !== a.user_id && roleOf.get(h.actor_id) ? ` · ${roleOf.get(h.actor_id)}` : ""}</span>
                {h.reasons.length > 0 && <span className="block text-muted">{h.reasons.map((r) => REASONS[r as keyof typeof REASONS] ?? r).join("; ")}</span>}
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
