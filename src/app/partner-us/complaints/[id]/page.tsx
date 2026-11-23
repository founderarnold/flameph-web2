import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { Select, Text, TextArea } from "@/components/PartnerFields";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { PARTNER_DOC_MAX_BYTES, PHOTO_MAX_SIDE } from "@/lib/partner";
import {
  ACTION_KINDS, ACTION_STATUS, canAppeal, CASE_DONE, CASE_ERRORS, CASE_STEPS, CLOSE_REASONS, COMPLAINT_COLS, COMPLAINT_CONSENT, COMPLAINT_PRIVACY,
  COMPLAINT_STATUS, complaintMissing, day, EVIDENCE_TYPES, ISSUES, manilaToday, MAX_EVIDENCE_FILES, overdue, peso, REMEDIES, SEVERITY, when,
  type ActionKind, type ActionStatus, type ComplaintRow,
} from "@/lib/partner-cases";
import {
  addCaseNote, appealComplaint, deleteDraftComplaint, deleteEvidence, markActionDone, partnerRespond, saveComplaint, uploadEvidence, withdrawComplaint,
} from "../actions";

export const metadata = { title: "Complaint", robots: { index: false } };

type Doc = { id: string; user_id: string; doc_type: keyof typeof EVIDENCE_TYPES; file_name: string; size_bytes: number; uploaded_at: string };
type Event = { id: string; side: "member" | "partner" | "team" | "system"; action: string; from_status: string | null; to_status: string | null; note: string | null; created_at: string };
type Action = { id: string; kind: ActionKind; description: string; due_on: string; amount: number | null; status: ActionStatus; partner_note: string | null; check_note: string | null };

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const WHO = { member: "Member", partner: "Partner", team: "FLAME PH national team", system: "FLAME PH" } as const;
const EVENT: Record<string, string> = {
  sent: "Complaint sent", status: "Status changed", severity: "Severity changed", partner_response: "Partner's answer", appeal: "Appeal",
  withdrawn: "Withdrawn by the member", note: "Note", evidence: "File added", action_added: "Fix requested", action_updated: "Fix updated",
};

/** One complaint. The member fills in and sends the draft; after that, both sides follow the case, add notes and
 *  proof, the partner answers and marks fixes done, and either side may appeal once within 7 days of the resolution. */
export default async function ComplaintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/complaints/${id}`);
  const { data: row } = await supabase.from("partner_complaints").select(COMPLAINT_COLS).eq("id", id).maybeSingle();
  if (!row) notFound();
  const c = row as unknown as ComplaintRow;
  const side = c.complainant_id === user.id ? "member" : c.partner_user_id === user.id ? "partner" : null;
  if (!side) notFound();
  const [{ data: docRows }, { data: evRows }, { data: actRows }] = await Promise.all([
    supabase.from("vetting_documents").select("id, user_id, doc_type, file_name, size_bytes, uploaded_at").eq("complaint_id", id).is("deleted_at", null).order("uploaded_at"),
    supabase.from("partner_complaint_events").select("id, side, action, from_status, to_status, note, created_at").eq("complaint_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("partner_corrective_actions").select("id, kind, description, due_on, amount, status, partner_note, check_note").eq("complaint_id", id).order("created_at"),
  ]);
  const docs = (docRows ?? []) as Doc[];
  const events = (evRows ?? []) as Event[];
  const actions = (actRows ?? []) as Action[];
  const draft = c.status === "draft";
  const err = sp.error ? CASE_ERRORS[sp.error] ?? CASE_ERRORS.failed : null;
  const done = sp.done ? CASE_DONE[sp.done] : null;
  const missing = complaintMissing(c);
  const late = overdue(c);
  const stepAt = CASE_STEPS.indexOf(c.status === "appealed" ? "resolved" : c.status);
  const myDocs = docs.filter((d) => d.user_id === user.id).length;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us/complaints" className="underline">Complaints</Link> › {c.ref_no}</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">{side === "member" ? "Ang inyong reklamo" : "Reklamo tungkol sa inyong negosyo"}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{c.ref_no}: {side === "member" ? c.partner_name : `order ${c.order_reference ?? "—"}`}</h1>
        <div className="mt-2"><Notice tone={c.status === "resolved" ? "ok" : draft ? "info" : "warn"}>Status: <strong>{COMPLAINT_STATUS[c.status].label}</strong> <span lang="fil">({COMPLAINT_STATUS[c.status].fil})</span>{!draft && <> · Severity: <strong>{SEVERITY[c.severity].label}</strong></>}</Notice></div>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {draft && side === "member" && (
        <form id="form" action={saveComplaint} className="card scroll-mt-24 space-y-4 p-4 sm:p-6">
          <input type="hidden" name="id" value={c.id} />
          <div>
            <h2 className="text-xl font-extrabold">What happened</h2>
            <p className="text-sm text-muted" lang="fil">Ikuwento ang nangyari. Puwedeng i-save at ituloy mamaya.</p>
          </div>
          <p className="text-sm">About: <strong>{c.partner_name}</strong></p>
          <Text name="order_reference" label="Order or service reference number" value={c.order_reference} need max={120} placeholder="e.g. MPH-10023 or the receipt number" help="From MarketplacePH Online Store, the partner's receipt or invoice." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="order_date" label="Date of the order or service (optional)" value={c.order_date} type="date" max={10} />
            <Text name="affected_value" label="Value of the affected items or service, in pesos (optional)" value={c.affected_value ?? ""} max={16} inputMode="decimal" placeholder="e.g. 9000" help="Only a note for the team. We do not check or collect it." />
          </div>
          <PartnerMoneyNotice compact />
          <Text name="product_or_service" label="Product or service (optional)" value={c.product_or_service} max={200} placeholder="e.g. Kraft bags 8x12, 20 packs" />
          <Select name="issue" label="What went wrong?" value={c.issue} need options={Object.entries(ISSUES).map(([k, v]) => [k, `${v.label} · ${v.fil}`])} />
          <TextArea name="description" label="Tell us what happened" value={c.description} need max={3000} rows={5} placeholder="When did you order? What was promised? What arrived, and when?" help="Facts only, please. No names of private people, no insults." />
          <Select name="desired_remedy" label="What would you like to happen?" value={c.desired_remedy} need options={Object.entries(REMEDIES)} />
          <Text name="remedy_note" label="More about what you would like (optional)" value={c.remedy_note} max={500} />
          <div className="rounded-xl border-2 border-primary p-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" name="consent" value="yes" className="check mt-1" />
              <span className="text-[15px] leading-6">{COMPLAINT_CONSENT.en}<span className="mt-1 block text-sm text-muted" lang="fil">{COMPLAINT_CONSENT.tl}</span></span>
            </label>
          </div>
          <p className="text-sm text-muted">{COMPLAINT_PRIVACY}</p>
          {missing.length > 0 && (
            <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn"><p className="font-bold">Still needed before sending:</p><ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
            <button type="submit" name="intent" value="send" className="btn btn-flame min-h-11 w-full sm:w-auto">Send complaint</button>
          </div>
        </form>
      )}

      {!draft && (
        <>
          <ol aria-label="Case progress" className="card grid grid-cols-5 gap-1 p-3 text-center text-xs">
            {CASE_STEPS.map((s, i) => (
              <li key={s} aria-current={i === stepAt ? "step" : undefined} className={`rounded-lg px-1 py-2 ${i <= stepAt ? "bg-primary-soft font-bold text-primary" : "text-muted"}`}>
                <span className="mx-auto mb-1 grid size-6 place-items-center rounded-full bg-bg-soft">{i + 1}</span>{COMPLAINT_STATUS[s].fil}
              </li>
            ))}
          </ol>
          <section className="card space-y-2 p-4 sm:p-5" aria-labelledby="sum-h">
            <h2 id="sum-h" className="text-lg font-bold">The complaint</h2>
            <dl className="grid gap-x-4 gap-y-1 text-[15px] sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold">Partner</dt><dd className="break-words">{c.partner_name}</dd>
              <dt className="font-semibold">Order reference</dt><dd className="break-words">{c.order_reference}{c.order_date ? ` (${day(c.order_date)})` : ""}</dd>
              {c.product_or_service && <><dt className="font-semibold">Product or service</dt><dd className="break-words">{c.product_or_service}</dd></>}
              <dt className="font-semibold">Problem</dt><dd>{c.issue ? ISSUES[c.issue].label : "—"}</dd>
              <dt className="font-semibold">Member asks for</dt><dd>{c.desired_remedy ? REMEDIES[c.desired_remedy] : "—"}{c.remedy_note ? `: ${c.remedy_note}` : ""}</dd>
              {c.affected_value !== null && <><dt className="font-semibold">Value (typed by the member)</dt><dd>{peso(c.affected_value)}</dd></>}
              <dt className="font-semibold">Sent</dt><dd>{when(c.submitted_at)}</dd>
            </dl>
            {c.affected_value !== null && <PartnerMoneyNotice compact />}
            <p className="whitespace-pre-line rounded-lg bg-bg-soft p-3 text-[15px]">{c.description}</p>
            {c.status !== "closed" && (
              <p className="text-sm text-muted">Target: first reply by {when(c.first_response_due_at)}{c.first_responded_at ? " (done)" : ""}; resolved by {when(c.resolve_due_at)}.{late ? " The time has passed and the team has been reminded." : ""}</p>
            )}
          </section>

          {(c.outcome_note || c.status === "closed") && (
            <section className={`card space-y-2 border-2 p-4 ${c.status === "resolved" ? "border-ok" : "border-line"}`} aria-labelledby="out-h">
              <h2 id="out-h" className="text-lg font-bold">Outcome</h2>
              {c.outcome_note && <p className="whitespace-pre-line text-[15px]">{c.outcome_note}</p>}
              {c.status === "closed" && c.close_reason && <p className="text-sm text-muted">Closed {when(c.closed_at)}: {CLOSE_REASONS[c.close_reason]}.</p>}
              {c.appeal_reason && <p className="text-sm"><strong>Appeal by the {c.appeal_by}:</strong> {c.appeal_reason}</p>}
            </section>
          )}

          <section id="respond" className="card scroll-mt-24 space-y-2 p-4 sm:p-5" aria-labelledby="resp-h">
            <h2 id="resp-h" className="text-lg font-bold">The partner&apos;s side</h2>
            {c.partner_response ? <p className="whitespace-pre-line text-[15px]">{c.partner_response}<span className="mt-1 block text-xs text-muted">{when(c.partner_responded_at)}</span></p>
              : <p className="text-sm text-muted">{side === "partner" ? "You have not answered yet." : "The partner has not answered yet."}</p>}
            {side === "partner" && c.status !== "closed" && (
              <form action={partnerRespond} className="space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <TextArea name="partner_response" label={c.partner_response ? "Change your answer" : "Your answer"} value={c.partner_response} max={3000} rows={4} help="Explain what happened and what you will do. Isulat ang inyong panig." />
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send my answer</SubmitButton>
              </form>
            )}
          </section>

          {actions.length > 0 && (
            <section id="actions" className="card scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="act-h">
              <h2 id="act-h" className="text-lg font-bold">Fixes requested by the national team</h2>
              {actions.some((a) => a.amount !== null) && <PartnerMoneyNotice compact />}
              <ul className="space-y-3">
                {actions.map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3">
                    <p className="font-bold">{ACTION_KINDS[a.kind]}{a.amount !== null ? `: ${peso(a.amount)}` : ""}</p>
                    <p className="text-[15px]">{a.description}</p>
                    <p className="text-sm text-muted">Due {day(a.due_on)} · {ACTION_STATUS[a.status]}</p>
                    {a.amount !== null && <p className="text-xs text-muted">A record only: the credit or refund is given by the partner or MarketplacePH Online Store, never through flameph.org.</p>}
                    {a.partner_note && <p className="text-sm"><strong>Partner:</strong> {a.partner_note}</p>}
                    {a.check_note && <p className="text-sm"><strong>Team:</strong> {a.check_note}</p>}
                    {side === "partner" && a.status === "open" && (
                      <form action={markActionDone} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={c.id} /><input type="hidden" name="action_id" value={a.id} />
                        <label htmlFor={`an-${a.id}`} className="label text-sm">What did you do? (e.g. the new order number)</label>
                        <input id={`an-${a.id}`} name="partner_note" maxLength={1000} className="input" />
                        <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Mark as done</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section id="evidence" className="card scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="ev-h">
        <h2 id="ev-h" className="text-lg font-bold">Photos and proof</h2>
        <p className="text-sm text-muted">Up to {MAX_EVIDENCE_FILES} files each, 4 MB each: PDF, JPG, PNG or WEBP. Photos are made smaller on your phone. Files are encrypted; only the two sides and the national team can open them.{!draft && " Once sent, files stay as evidence and cannot be removed."}</p>
        {docs.length === 0 ? <p className="text-sm">No files yet.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 text-sm"><span className="block break-words font-semibold">{d.file_name}</span>
                  <span className="text-muted">{EVIDENCE_TYPES[d.doc_type]?.label ?? d.doc_type} · {kb(d.size_bytes)} · from {d.user_id === c.complainant_id ? "the member" : d.user_id === c.partner_user_id ? "the partner" : "the team"}</span></span>
                <span className="flex gap-2">
                  {d.user_id !== user.id && <a href={`/api/vetting/doc/${d.id}`} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3 text-sm">Open</a>}
                  {draft && d.user_id === user.id && (
                    <form action={deleteEvidence}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="doc_id" value={d.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {c.status !== "closed" && myDocs < MAX_EVIDENCE_FILES && (
          <form action={uploadEvidence} className="space-y-3 rounded-xl border border-line p-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="field">
              <label htmlFor="doc_type" className="label">What is it?</label>
              <select id="doc_type" name="doc_type" className="input" defaultValue="evidence_photo">
                {Object.entries(EVIDENCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ev-file" className="label">File</label>
              <ShrinkPhotoInput id="ev-file" maxBytes={PARTNER_DOC_MAX_BYTES} maxSide={PHOTO_MAX_SIDE} />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Add file</SubmitButton>
          </form>
        )}
      </section>

      {!draft && (
        <section id="history" className="card scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-bold">Case history and notes</h2>
          {c.status !== "closed" && (
            <form action={addCaseNote} className="space-y-2">
              <input type="hidden" name="id" value={c.id} />
              <label htmlFor="note" className="label">Add a note (both sides and the national team read it)</label>
              <textarea id="note" name="note" maxLength={2000} rows={3} className="input" />
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Adding…">Add note</SubmitButton>
            </form>
          )}
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg bg-bg-soft p-3 text-sm">
                <p className="font-semibold">{EVENT[e.action] ?? e.action}{e.to_status ? `: ${COMPLAINT_STATUS[e.to_status as keyof typeof COMPLAINT_STATUS]?.label ?? e.to_status}` : ""}</p>
                {e.note && <p className="whitespace-pre-line break-words">{e.note}</p>}
                <p className="text-xs text-muted">{WHO[e.side]} · {when(e.created_at)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {canAppeal(c) && (
        <form id="appeal" action={appealComplaint} className="card scroll-mt-24 space-y-2 p-4 sm:p-5">
          <input type="hidden" name="id" value={c.id} />
          <h2 className="text-lg font-bold">Not happy with the outcome?</h2>
          <p className="text-sm text-muted">You may appeal once, within 7 days of the resolution (until {when(new Date(Date.parse(c.resolved_at!) + 7 * 86400_000).toISOString())}). The founder decides. <span lang="fil">Puwedeng umapela nang isang beses.</span></p>
          <TextArea name="appeal_reason" label="Why do you appeal?" max={2000} rows={3} />
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send appeal</SubmitButton>
        </form>
      )}

      {side === "member" && ["open", "investigating"].includes(c.status) && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Withdraw this complaint</summary>
          <form action={withdrawComplaint} className="mt-2 space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <Text name="why" label="Why (optional)" max={500} placeholder="e.g. The partner already fixed it" />
            <SubmitButton className="btn btn-outline min-h-11 w-full text-danger sm:w-auto" pendingText="Withdrawing…">Withdraw complaint</SubmitButton>
          </form>
        </details>
      )}
      {draft && side === "member" && (
        <form action={deleteDraftComplaint} className="text-right"><input type="hidden" name="id" value={c.id} />
          <SubmitButton className="btn btn-outline min-h-11 text-danger" pendingText="Deleting…">Delete this draft</SubmitButton></form>
      )}
      <p className="text-sm text-muted">flameph.org never collects or holds money. Refunds, credits and penalties are settled by MarketplacePH Online Store or the partner. Last saved {when(c.updated_at)}. Today is {day(manilaToday())}.</p>
    </div>
  );
}
