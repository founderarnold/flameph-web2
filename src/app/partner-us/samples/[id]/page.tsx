import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { Select, Text, TextArea } from "@/components/PartnerFields";
import { PARTNER_DOC_MAX_BYTES, PHOTO_MAX_SIDE } from "@/lib/partner";
import {
  ARRIVAL, CASE_DONE, CASE_ERRORS, day, FEEDBACK_TAGS, MAX_SAMPLE_PHOTOS, RECOMMEND, SAMPLE_COLS, SAMPLE_SCORES, SAMPLE_STATUS, sampleMissing,
  sampleTotal, SCORE_WORDS, when, YES_PARTLY_NO, type SampleRow,
} from "@/lib/partner-cases";
import { deleteSampleDraft, deleteSamplePhoto, saveSample, uploadSamplePhoto } from "../actions";

export const metadata = { title: "Sample test", robots: { index: false } };

type Doc = { id: string; file_name: string; size_bytes: number };
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One sample test: the standard form (arrival, five 1-to-5 scores, standard comments, safety), photos, then send. */
export default async function SampleTest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/samples/${id}`);
  const [{ data }, { data: docRows }] = await Promise.all([
    supabase.from("partner_sample_tests").select(`${SAMPLE_COLS}, tester_id`).eq("id", id).eq("tester_id", user.id).maybeSingle(),
    supabase.from("vetting_documents").select("id, file_name, size_bytes").eq("sample_id", id).eq("user_id", user.id).is("deleted_at", null).order("uploaded_at"),
  ]);
  if (!data) notFound();
  const t = data as unknown as SampleRow;
  const docs = (docRows ?? []) as Doc[];
  const draft = t.status === "draft";
  const missing = sampleMissing(t, docs.length);
  const err = sp.error ? CASE_ERRORS[sp.error] ?? CASE_ERRORS.failed : null;
  const done = sp.done ? CASE_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us/samples" className="underline">Sample tests</Link> › {t.ref_no}</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">{t.partner_name}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{t.product_name}</h1>
        <div className="mt-2"><Notice tone={draft ? "info" : "ok"}>Status: <strong>{SAMPLE_STATUS[t.status].label}</strong>{t.total !== null ? ` · score ${sampleTotal(t.total)}` : ""}</Notice></div>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {draft ? (
        <form id="form" action={saveSample} className="card scroll-mt-24 space-y-5 p-4 sm:p-6">
          <input type="hidden" name="id" value={t.id} />
          <fieldset className="space-y-4">
            <legend className="text-lg font-extrabold">1. When it arrived <span className="text-sm font-normal text-muted" lang="fil">· Pagdating</span></legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text name="received_on" label="Date received" value={t.received_on} need type="date" max={10} />
              <Text name="expiry_on" label="Expiry or best-before date (if any)" value={t.expiry_on} type="date" max={10} />
            </div>
            <Text name="batch_lot" label="Batch or lot number (if printed)" value={t.batch_lot} max={60} />
            <Select name="arrival_condition" label="Condition when it arrived" value={t.arrival_condition} need options={Object.entries(ARRIVAL)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select name="matches_description" label="Does it match the description?" value={t.matches_description} need options={Object.entries(YES_PARTLY_NO)} />
              <Select name="label_complete" label="Is the label complete?" value={t.label_complete} need options={Object.entries(YES_PARTLY_NO)} help="Name, maker and address, contents, expiry, FDA number where needed." />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-lg font-extrabold">2. Scores, 1 to 5 <span className="text-sm font-normal text-muted" lang="fil">· Marka</span></legend>
            {SAMPLE_SCORES.map((s) => (
              <div key={s.key} role="radiogroup" aria-labelledby={`${s.key}-l`} className="rounded-xl border border-line p-3">
                <p id={`${s.key}-l`} className="font-semibold">{s.label} <span className="text-sm font-normal text-muted" lang="fil">· {s.fil}</span><span className="ml-1 text-xs font-normal text-muted">(needed to send)</span></p>
                <p className="text-sm text-muted">{s.help}</p>
                <div className="mt-2 grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border border-line text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-bold">
                      <input type="radio" name={s.key} value={n} defaultChecked={t[s.key] === n} className="sr-only" />
                      <span className="text-lg">{n}</span><span className="hidden text-[11px] text-muted sm:block">{SCORE_WORDS[n].slice(2)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-lg font-extrabold">3. Comments <span className="text-sm font-normal text-muted" lang="fil">· Puna</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(FEEDBACK_TAGS).map(([k, v]) => (
                <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm">
                  <input type="checkbox" name="feedback_tags" value={k} defaultChecked={t.feedback_tags.includes(k as keyof typeof FEEDBACK_TAGS)} className="check" />{v}
                </label>
              ))}
            </div>
            <TextArea name="feedback" label="What else did you notice?" value={t.feedback} max={2000} rows={4} placeholder="How you used it, what you liked, what should be better" />
            <Select name="would_recommend" label="Would you recommend it to members?" value={t.would_recommend} need options={Object.entries(RECOMMEND)} />
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border-2 border-danger p-3">
            <legend className="px-1 font-extrabold text-danger">4. Safety</legend>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" name="safety_concern" value="yes" defaultChecked={t.safety_concern} className="check mt-1" />
              <span className="text-[15px]">Something about this sample could hurt someone or make them sick (sharp edges, spoiled, leaking chemicals, no warning label).<span className="block text-sm text-muted" lang="fil">May panganib ba sa kaligtasan o kalusugan?</span></span>
            </label>
            <TextArea name="safety_note" label="What is the safety concern?" value={t.safety_note} max={1000} rows={2} />
          </fieldset>

          {missing.length > 0 && (
            <div className="rounded-xl bg-warn-soft p-3 text-sm text-warn"><p className="font-bold">Still needed before sending:</p><ul className="list-disc pl-5">{missing.map((m) => <li key={m}>{m}</li>)}</ul></div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
            <button type="submit" name="intent" value="send" className="btn btn-flame min-h-11 w-full sm:w-auto">Send to the national team</button>
          </div>
        </form>
      ) : (
        <section className="card space-y-2 p-4 sm:p-5" aria-labelledby="res-h">
          <h2 id="res-h" className="text-lg font-bold">Your test</h2>
          <p className="text-sm">Received {day(t.received_on)}{t.batch_lot ? ` · lot ${t.batch_lot}` : ""}{t.expiry_on ? ` · expires ${day(t.expiry_on)}` : ""} · {t.arrival_condition ? ARRIVAL[t.arrival_condition] : ""}</p>
          <p className="text-sm">{SAMPLE_SCORES.map((s) => `${s.label} ${t[s.key]}/5`).join(" · ")}</p>
          <p className="text-sm">{t.would_recommend ? RECOMMEND[t.would_recommend] : ""}{t.feedback_tags.length ? ` · ${t.feedback_tags.map((x) => FEEDBACK_TAGS[x]).join(", ")}` : ""}</p>
          {t.feedback && <p className="whitespace-pre-line text-[15px]">{t.feedback}</p>}
          {t.safety_concern && <p className="text-sm font-bold text-danger">Safety: {t.safety_note}</p>}
          <p className="text-xs text-muted">Sent {when(t.submitted_at)}{t.reviewed_at ? ` · reviewed ${when(t.reviewed_at)}` : ""}</p>
        </section>
      )}

      <section id="photos" className="card scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="ph-h">
        <h2 id="ph-h" className="text-lg font-bold">Photos <span className="text-sm font-normal text-muted">(at least 1, up to {MAX_SAMPLE_PHOTOS})</span></h2>
        <p className="text-sm text-muted">The package as it arrived, the label, and the product in use. Photos are made smaller on your phone and kept private.</p>
        {docs.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0 break-words">{d.file_name} <span className="text-muted">· {kb(d.size_bytes)}</span></span>
                {draft && <form action={deleteSamplePhoto}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="doc_id" value={d.id} />
                  <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>}
              </li>
            ))}
          </ul>
        )}
        {draft && docs.length < MAX_SAMPLE_PHOTOS && (
          <form action={uploadSamplePhoto} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />
            <div className="field"><label htmlFor="ph-file" className="label">Photo</label><ShrinkPhotoInput id="ph-file" maxBytes={PARTNER_DOC_MAX_BYTES} maxSide={PHOTO_MAX_SIDE} /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Add photo</SubmitButton>
          </form>
        )}
      </section>

      {draft && (
        <form action={deleteSampleDraft} className="text-right"><input type="hidden" name="id" value={t.id} />
          <SubmitButton className="btn btn-outline min-h-11 text-danger" pendingText="Deleting…">Delete this draft</SubmitButton></form>
      )}
    </div>
  );
}
