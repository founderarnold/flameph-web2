import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { getConsents } from "@/lib/consents";
import { CONSENTS } from "@/lib/policy";
import { deleteVettingDoc, giveVettingConsent, uploadVettingDoc, withdrawVettingConsent } from "@/app/account/vetting-actions";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { DOC_KEYS, DOC_TYPES, MAX_DOC_BYTES, MAX_DOCS_PER_TYPE, RETENTION_TEXT, VET_DONE, VET_ERRORS, type DocType } from "@/lib/vetting";
import { PAIR_CAP } from "@/lib/records";

export const metadata = { title: "Business vetting", robots: { index: false } };

type Doc = { id: string; doc_type: DocType; file_name: string; size_bytes: number; uploaded_at: string };
const SWITCH = CONSENTS.find((c) => c.key === "vetting")!;
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Optional business vetting: separate consent (switch 4), documents only reviewers can open, encrypted and deleted on schedule. */
export default async function VettingPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/account/vetting");
  const [{ ready, state }, { data: biz }, { data: docs, error: docsErr }] = await Promise.all([
    getConsents(supabase, user.id),
    supabase.from("businesses").select("id, name, verified, verification_status, verification_note").eq("owner_id", user.id).order("created_at").limit(1).maybeSingle(),
    supabase.from("vetting_documents").select("*").eq("user_id", user.id).is("deleted_at", null).order("uploaded_at", { ascending: false }),
  ]);
  const consent = Boolean(state.vetting?.granted);
  // Partner application documents (0031) are listed on the partner application, not here.
  const list = ((docs ?? []) as (Doc & { purpose?: string })[]).filter((d) => (d.purpose ?? "vetting") === "vetting");
  const vetted = Boolean(biz?.verified && biz.verification_status === "approved");
  const status = !biz ? "No business page yet" : vetted ? "Vetted ✓" : biz.verification_status === "pending" ? "Waiting for review" : biz.verification_status === "rejected" ? "Not approved yet" : "Not submitted";
  const err = sp.error ? VET_ERRORS[sp.error] ?? VET_ERRORS.failed : null;
  const done = sp.done ? VET_DONE[sp.done] : null;
  const unavailable = !ready || Boolean(docsErr);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-3xl font-extrabold text-primary">Business vetting</h1>
      <p className="text-muted">Optional. FLAME PH reviewers check your registration documents and mark your business as vetted. When both businesses in a deal are vetted, all your confirmed records with that member count, not only the first {PAIR_CAP}.</p>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card space-y-1 p-4" aria-labelledby="status-h">
        <h2 id="status-h" className="text-lg font-bold">Status: {status}</h2>
        {biz?.verification_status === "rejected" && biz.verification_note && <p className="text-sm">Reviewer&apos;s note: {biz.verification_note}</p>}
        {!biz && <p className="text-sm text-muted"><Link href="/account/business" className="font-semibold text-primary underline">Create your business page</Link> first.</p>}
      </section>

      {unavailable ? <Notice tone="info">{VET_ERRORS.unavailable}</Notice> : !consent ? (
        <section className="card space-y-3 p-4" aria-labelledby="consent-h">
          <h2 id="consent-h" className="text-lg font-bold">Switch 4: {SWITCH.title}</h2>
          <p>&ldquo;{SWITCH.en}&rdquo;</p>
          <p lang="fil" className="text-sm text-muted">{SWITCH.tl}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Only FLAME PH reviewers (admins and founders) can open your documents. Other members never see them.</li>
            <li>Files are encrypted before they are stored. Every time a reviewer opens one, it is logged.</li>
            <li>{RETENTION_TEXT}</li>
          </ul>
          <form action={giveVettingConsent}><SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Turn on switch 4 and continue</SubmitButton></form>
          <p className="text-xs text-muted">Saying no never blocks other member features. This choice is saved in your <Link href="/account/settings#history" className="underline">consent history</Link>.</p>
        </section>
      ) : (
        <>
          <section className="card space-y-4 p-4" aria-labelledby="upload-h">
            <h2 id="upload-h" className="text-lg font-bold">Send a document</h2>
            <form action={uploadVettingDoc} className="space-y-4">
              <fieldset>
                <legend className="label">Which document?</legend>
                <div className="grid gap-2">
                  {DOC_KEYS.map((k) => (
                    <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                      <input type="radio" name="doc_type" value={k} required className="mt-1 size-4" />
                      <span><span className="block font-semibold">{DOC_TYPES[k].label}</span><span className="block text-xs text-muted">{DOC_TYPES[k].help}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="file" className="label">File (PDF, JPG, PNG or WEBP, up to 4 MB)</label>
                <ShrinkPhotoInput id="file" maxBytes={MAX_DOC_BYTES} />
              </div>
              <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Uploading…">Upload securely</SubmitButton>
            </form>
            <p className="text-xs text-muted">Up to {MAX_DOCS_PER_TYPE} files per document. {RETENTION_TEXT}</p>
          </section>

          <section className="card space-y-2 p-4" aria-labelledby="docs-h">
            <h2 id="docs-h" className="text-lg font-bold">What you sent</h2>
            {list.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <ul className="divide-y divide-line">
                {list.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{DOC_TYPES[d.doc_type]?.label ?? d.doc_type}</span>
                      <span className="block truncate text-xs text-muted">{d.file_name} · {kb(d.size_bytes)} · {new Date(d.uploaded_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</span></span>
                    <form action={deleteVettingDoc}><input type="hidden" name="doc_id" value={d.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Deleting…">Delete</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">For your privacy you can&apos;t open the files here; only reviewers can. Delete and upload again to replace one.</p>
          </section>

          <section className="card space-y-2 p-4" aria-labelledby="withdraw-h">
            <h2 id="withdraw-h" className="text-lg font-bold">Stop vetting</h2>
            <p className="text-sm text-muted">Turning off switch 4 deletes all your vetting documents right away. A decision already made stays.</p>
            <details className="rounded-xl border border-line p-3">
              <summary className="min-h-11 cursor-pointer content-center font-semibold">Turn off switch 4…</summary>
              <form action={withdrawVettingConsent} className="mt-2"><SubmitButton className="btn btn-danger min-h-11" pendingText="Deleting…">Yes, turn off and delete my documents</SubmitButton></form>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
