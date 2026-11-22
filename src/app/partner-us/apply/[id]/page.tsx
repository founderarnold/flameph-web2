import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { INDUSTRY_NAMES } from "@/lib/industries";
import { PROVINCES } from "@/content/ph-provinces";
import {
  COVERAGE, DECLARATION, DETAIL_FIELDS, EDITABLE, formatTinMasked, LAST_STEP, MAX_DOCS_PER_APPLICATION, missingItems, PARTNER_CATEGORIES,
  PARTNER_DOC_KEYS, PARTNER_DOC_MAX_BYTES, PARTNER_DOC_TYPES, PARTNER_DONE, PARTNER_ERRORS, PARTNER_PRIVACY, PHOTO_MAX_SIDE, REASONS,
  REGISTRATION_TYPES, requiredDocs, shown, STATUS, STEPS, type AppRow, type DetailField, type PartnerStatus,
} from "@/lib/partner";
import { deletePartnerDoc, reopenApplication, saveStep, submitApplication, uploadPartnerDoc, withdrawApplication } from "../../actions";

export const metadata = { title: "Partner application", robots: { index: false } };

type Doc = { id: string; doc_type: string; file_name: string; size_bytes: number; uploaded_at: string; review_status: string | null };
type Review = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number };

const COLS = "id, category, status, revision, legal_name, trade_name, registration_type, registration_no, tin_last3, industry, website, rep_name, rep_position, biz_email, biz_phone, address_line, city, province, coverage, coverage_areas, details, privacy_ack_at, declaration_at, submitted_at, decided_at, decision_reasons, decision_note, created_at, updated_at";
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const tone = (s: PartnerStatus) => ({ ok: "ok", warn: "warn", danger: "danger", info: "info" } as const)[STATUS[s].tone];

/** A text field in the design-system style: label, Taglish or example help, and "needed to send" for required ones. */
function Text({ name, label, value, help, need, type = "text", max, auto, placeholder }: { name: string; label: string; value?: string | null; help?: string; need?: boolean; type?: string; max: number; auto?: string; placeholder?: string }) {
  return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{need && <span className="ml-1 text-xs font-normal text-muted">(needed to send)</span>}</label>
      <input id={name} name={name} type={type} defaultValue={value ?? ""} maxLength={max} autoComplete={auto} placeholder={placeholder} className="input" aria-describedby={help ? `${name}-help` : undefined} />
      {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    </div>
  );
}

function Select({ name, label, value, options, need, help }: { name: string; label: string; value?: string | null; options: [string, string][]; need?: boolean; help?: string }) {
  return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{need && <span className="ml-1 text-xs font-normal text-muted">(needed to send)</span>}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="input" aria-describedby={help ? `${name}-help` : undefined}>
        <option value="">Choose…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {help && <p id={`${name}-help`} className="field-help">{help}</p>}
    </div>
  );
}

function DetailInput({ f, value }: { f: DetailField; value?: string }) {
  const name = `d_${f.name}`;
  const label = f.showIf ? `${f.label}` : f.label;
  if (f.type === "select") return <Select name={name} label={label} value={value} options={(f.options ?? []).map((o) => [o, o])} need={f.required} help={f.help} />;
  if (f.type === "textarea") return (
    <div className="field">
      <label htmlFor={name} className="label">{label}{f.required && <span className="ml-1 text-xs font-normal text-muted">(needed to send)</span>}</label>
      <textarea id={name} name={name} defaultValue={value ?? ""} maxLength={f.max} rows={4} className="input" aria-describedby={f.help ? `${name}-help` : undefined} />
      {f.help && <p id={`${name}-help`} className="field-help">{f.help}</p>}
    </div>
  );
  return <Text name={name} label={label} value={value} help={f.help} need={f.required} max={f.max ?? 300} />;
}

/** Save draft (stay) and Save and continue (next screen). Both keep everything typed so far. */
function SaveButtons({ step }: { step: number }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
      <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
      {step < LAST_STEP && <button type="submit" name="intent" value="next" className="btn btn-primary min-h-11 w-full sm:w-auto">Save and continue →</button>}
    </div>
  );
}

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/apply/${id}`);
  const [{ data: row }, { data: docRows }, { data: reviewRows }] = await Promise.all([
    supabase.from("partner_applications").select(COLS).eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("vetting_documents").select("id, doc_type, file_name, size_bytes, uploaded_at, review_status").eq("application_id", id).eq("user_id", user.id).is("deleted_at", null).order("uploaded_at"),
    supabase.from("partner_reviews").select("id, action, reasons, note, created_at, revision").eq("application_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!row) notFound();
  const a = row as unknown as AppRow;
  const docs = (docRows ?? []) as Doc[];
  const history = (reviewRows ?? []) as Review[];
  const d = a.details ?? {};
  const cat = PARTNER_CATEGORIES[a.category];
  const editable = EDITABLE.includes(a.status);
  const step = editable ? Math.min(LAST_STEP, Math.max(1, Number(sp.step) || 1)) : LAST_STEP;
  const missing = missingItems(a, docs.map((x) => x.doc_type));
  const need = requiredDocs(a.category, d);
  const err = sp.error ? PARTNER_ERRORS[sp.error] ?? PARTNER_ERRORS.failed : null;
  const done = sp.done ? PARTNER_DONE[sp.done] : null;
  const conditional = DETAIL_FIELDS[a.category].filter((f) => f.showIf);

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › <Link href="/partner-us/apply" className="underline">My applications</Link>
      </nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">{cat.fil}</p>
        <h1 className="text-2xl font-extrabold text-primary sm:text-3xl">{cat.label} application</h1>
        <div className="mt-2"><Notice tone={tone(a.status)}>Status: <strong>{STATUS[a.status].label}</strong>{a.revision > 1 ? ` · version ${a.revision}` : ""}</Notice></div>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {(a.status === "needs_changes" || a.status === "rejected") && (a.decision_reasons.length > 0 || a.decision_note) && (
        <section className="card space-y-2 border-2 border-warn p-4" aria-labelledby="reasons-h">
          <h2 id="reasons-h" className="text-lg font-bold">{a.status === "needs_changes" ? "What the review team asks you to fix" : "Why it was not approved"}</h2>
          <ul className="list-disc space-y-1 pl-5">{a.decision_reasons.map((r) => <li key={r}>{REASONS[r as keyof typeof REASONS] ?? r}</li>)}</ul>
          {a.decision_note && <p className="whitespace-pre-line text-[15px]"><strong>Note:</strong> {a.decision_note}</p>}
          {a.status === "rejected" && (
            <form action={reopenApplication} className="pt-1"><input type="hidden" name="id" value={a.id} />
              <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Opening…">Fix and apply again</SubmitButton>
              <p className="mt-1 text-xs text-muted" lang="fil">Bubuksan ulit ang inyong application bilang draft. Naka-save pa rin ang mga sagot at dokumento.</p>
            </form>
          )}
        </section>
      )}

      {editable && (
        <nav aria-label="Application steps" className="card p-3">
          <p className="px-1 text-sm font-semibold sm:hidden">Step {step} of {LAST_STEP}: {STEPS[step - 1].title}</p>
          <div className="mx-1 mt-2 h-2 overflow-hidden rounded-full bg-bg-soft sm:hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${(step / LAST_STEP) * 100}%` }} /></div>
          <ol className="mt-2 flex gap-1 overflow-x-auto sm:mt-0 sm:grid sm:grid-cols-5">
            {STEPS.map((s) => (
              <li key={s.n} className="shrink-0">
                <Link href={`/partner-us/apply/${a.id}?step=${s.n}`} aria-current={s.n === step ? "step" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm ${s.n === step ? "bg-primary-soft font-bold text-primary" : "text-muted hover:bg-bg-soft"}`}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.n === step ? "bg-primary text-primary-fg" : "bg-bg-soft"}`}>{s.n}</span>
                  <span className="hidden sm:inline">{s.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {editable && step <= 3 && (
        <form action={saveStep} className="card space-y-4 p-4 sm:p-6">
          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="step" value={step} />
          <div>
            <h2 className="text-xl font-extrabold">{STEPS[step - 1].title}</h2>
            <p className="text-sm text-muted" lang="fil">{STEPS[step - 1].fil}. Puwedeng i-save at ituloy mamaya.</p>
          </div>
          {step === 1 && <>
            <Text name="legal_name" label="Registered business name" value={a.legal_name} need max={200} auto="organization" help="Exactly as written on your DTI, SEC or CDA certificate." />
            <Text name="trade_name" label="Brand or store name (if different)" value={a.trade_name} max={200} />
            <Select name="registration_type" label="Type of registration" value={a.registration_type} need options={Object.entries(REGISTRATION_TYPES)} />
            <Text name="registration_no" label="Registration number" value={a.registration_no} need max={60} help="DTI Business Name No., SEC Registration No., or CDA Registration No." />
            <Text name="tin" label={a.tin_last3 ? `TIN (saved: ${formatTinMasked(a.tin_last3)})` : "TIN (Tax Identification Number)"} need={!a.tin_last3} max={20} type="text" auto="off" placeholder="123-456-789-000"
              help={a.tin_last3 ? "Leave blank to keep the saved TIN. Type a new one only to change it." : "Hindi ito ipapakita sa publiko. It is encrypted and only the national review team can see it."} />
            <Select name="industry" label="Industry" value={a.industry} options={INDUSTRY_NAMES.map((n) => [n, n])} />
            <Text name="website" label="Website or Facebook page (optional)" value={a.website} max={300} type="text" auto="url" placeholder="www.yourbusiness.ph" />
          </>}
          {step === 2 && <>
            <Text name="rep_name" label="Name of the representative" value={a.rep_name} need max={120} auto="name" help="The owner or the person allowed to apply for the business." />
            <Text name="rep_position" label="Position" value={a.rep_position} max={120} placeholder="Owner, Sales Manager…" />
            <Text name="biz_email" label="Business email" value={a.biz_email} need max={200} type="email" auto="email" />
            <Text name="biz_phone" label="Business phone" value={a.biz_phone} need max={40} type="tel" auto="tel" placeholder="0917 123 4567" />
            <Text name="address_line" label="Business address (street, barangay)" value={a.address_line} max={300} auto="street-address" />
            <Text name="city" label="City or municipality" value={a.city} need max={100} auto="address-level2" />
            <Select name="province" label="Province" value={a.province} need options={PROVINCES.map((p) => [p, p])} />
            <Select name="coverage" label="Area you can serve" value={a.coverage} need options={Object.entries(COVERAGE)} help="Saan kayo puwedeng mag-deliver o magserbisyo?" />
            <Text name="coverage_areas" label="Towns, provinces or regions you serve (optional)" value={a.coverage_areas} max={500} placeholder="e.g. Metro Manila, Rizal, Cavite" />
          </>}
          {step === 3 && <>
            {conditional.length > 0 && (
              <style>{`@supports selector(:has(*)) { ${conditional.map((f) => `[data-showif="${f.showIf!.field}=${f.showIf!.equals}"]{display:none} form:has(select[name="d_${f.showIf!.field}"] option[value="${f.showIf!.equals}"]:checked) [data-showif="${f.showIf!.field}=${f.showIf!.equals}"]{display:block}`).join(" ")} }`}</style>
            )}
            {DETAIL_FIELDS[a.category].map((f) => (
              <div key={f.name} data-showif={f.showIf ? `${f.showIf.field}=${f.showIf.equals}` : undefined}>
                <DetailInput f={f} value={d[f.name]} />
              </div>
            ))}
          </>}
          <SaveButtons step={step} />
        </form>
      )}

      {editable && step === 4 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="docs-h">
          <div>
            <h2 id="docs-h" className="text-xl font-extrabold">Documents</h2>
            <p className="text-sm text-muted" lang="fil">I-upload ang PDF o litrato ng bawat dokumento. Naka-encrypt at pribado ang mga ito.</p>
          </div>
          <ul className="space-y-2">
            {need.map((t) => {
              const has = docs.some((x) => x.doc_type === t);
              return <li key={t} className="flex items-start gap-2 text-[15px]"><span aria-hidden className={has ? "text-ok" : "text-muted"}>{has ? "✓" : "○"}</span><span><strong>{PARTNER_DOC_TYPES[t].label}</strong>{has ? " — received" : " — needed to send"}<span className="block text-xs text-muted">{PARTNER_DOC_TYPES[t].help}</span></span></li>;
            })}
          </ul>
          {docs.length < MAX_DOCS_PER_APPLICATION ? (
            <form action={uploadPartnerDoc} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
              <input type="hidden" name="id" value={a.id} />
              <div className="field">
                <label htmlFor="doc_type" className="label">Which document is this?</label>
                <select id="doc_type" name="doc_type" required className="input" defaultValue={need.find((t) => !docs.some((x) => x.doc_type === t)) ?? ""}>
                  <option value="">Choose…</option>
                  {PARTNER_DOC_KEYS.map((k) => <option key={k} value={k}>{PARTNER_DOC_TYPES[k].label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="file" className="label">File</label>
                <ShrinkPhotoInput id="file" maxBytes={PARTNER_DOC_MAX_BYTES} maxSide={PHOTO_MAX_SIDE} />
              </div>
              <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Upload securely</SubmitButton>
            </form>
          ) : <Notice tone="info">{PARTNER_ERRORS.too_many}</Notice>}
          <div>
            <h3 className="font-bold">Files you sent ({docs.length} of {MAX_DOCS_PER_APPLICATION})</h3>
            {docs.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <ul className="divide-y divide-line">
                {docs.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{PARTNER_DOC_TYPES[x.doc_type as keyof typeof PARTNER_DOC_TYPES]?.label ?? x.doc_type}{x.review_status === "problem" ? <span className="ml-2 rounded-full bg-danger-soft px-2 text-xs font-bold text-danger">Please replace</span> : x.review_status === "ok" ? <span className="ml-2 rounded-full bg-ok-soft px-2 text-xs font-bold text-ok">Checked</span> : null}</span>
                      <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                    <form action={deletePartnerDoc}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="doc_id" value={x.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Deleting…">Delete</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">For your privacy you can&apos;t open the files here; only the review team can. To replace one, delete it and upload again.</p>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`/partner-us/apply/${a.id}?step=3`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`/partner-us/apply/${a.id}?step=5`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {step === LAST_STEP && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="review-h">
          <div>
            <h2 id="review-h" className="text-xl font-extrabold">{editable ? "Check and send" : "Your application"}</h2>
            {editable && <p className="text-sm text-muted" lang="fil">Suriin ang lahat bago ipadala.</p>}
          </div>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {([
              ["Registered business name", a.legal_name], ["Brand or store name", a.trade_name],
              ["Registration", a.registration_type ? `${REGISTRATION_TYPES[a.registration_type as keyof typeof REGISTRATION_TYPES]} ${a.registration_no ?? ""}` : null],
              ["TIN", formatTinMasked(a.tin_last3)], ["Industry", a.industry], ["Website", a.website],
              ["Representative", [a.rep_name, a.rep_position].filter(Boolean).join(", ")], ["Business email", a.biz_email], ["Business phone", a.biz_phone],
              ["Address", [a.address_line, a.city, a.province].filter(Boolean).join(", ")],
              ["Area you serve", a.coverage ? `${COVERAGE[a.coverage as keyof typeof COVERAGE]}${a.coverage_areas ? `: ${a.coverage_areas}` : ""}` : null],
              ...DETAIL_FIELDS[a.category].filter((f) => shown(f, d)).map((f) => [f.label, d[f.name]] as [string, string | undefined]),
              ["Documents", docs.length ? docs.map((x) => PARTNER_DOC_TYPES[x.doc_type as keyof typeof PARTNER_DOC_TYPES]?.label ?? x.doc_type).join(", ") : null],
            ] as [string, string | null | undefined][]).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>
            ))}
          </dl>

          {editable && (missing.length > 0 ? (
            <div role="status" className="rounded-xl bg-warn-soft p-4 text-warn">
              <p className="font-bold">Still needed before you can send ({missing.length}):</p>
              <ul className="mt-2 space-y-1">{missing.map((m) => <li key={m.what}><Link href={`/partner-us/apply/${a.id}?step=${m.step}`} className="font-semibold underline">{m.what}</Link> <span className="text-sm">(step {m.step})</span></li>)}</ul>
            </div>
          ) : (
            <form action={submitApplication} className="space-y-4">
              <input type="hidden" name="id" value={a.id} />
              <fieldset className="space-y-2 rounded-xl border border-line p-3 sm:p-4">
                <legend className="px-1 font-bold">Privacy notice (version {PARTNER_PRIVACY.version})</legend>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{PARTNER_PRIVACY.points.map((p) => <li key={p}>{p}</li>)}</ul>
                <p className="text-sm text-muted" lang="fil">{PARTNER_PRIVACY.tl}</p>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 pt-1"><input type="checkbox" name="privacy_ack" value="yes" required className="check mt-0.5" /><span>I have read the privacy notice and agree that FLAME PH uses my information this way.</span></label>
              </fieldset>
              <fieldset className="space-y-2 rounded-xl border border-line p-3 sm:p-4">
                <legend className="px-1 font-bold">Declaration</legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="declaration" value="yes" required className="check mt-0.5" /><span>{DECLARATION.en}<span className="mt-1 block text-sm text-muted" lang="fil">{DECLARATION.tl}</span></span></label>
              </fieldset>
              <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Sending…">{a.status === "needs_changes" ? "Send again for review" : "Send my application"}</SubmitButton>
            </form>
          ))}
          {!editable && a.status === "submitted" && <Notice tone="info">The national review team is checking your application. We will tell you in your Inbox and by email. You can&apos;t change it while it is being checked.</Notice>}
          {!editable && a.status === "approved" && <Notice tone="ok">Your business is an accredited FLAME PH {cat.label.toLowerCase()}. {a.category === "supplier" ? "The Best Offer form opens in the next stage; we will tell you." : "We will tell you when your next form opens."}</Notice>}
          {a.status === "withdrawn" && (
            <form action={reopenApplication}><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Opening…">Open it again as a draft</SubmitButton></form>
          )}
          {editable && <div className="border-t border-line pt-4"><Link href={`/partner-us/apply/${a.id}?step=4`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back to documents</Link></div>}
        </section>
      )}

      {history.length > 0 && (
        <section className="card p-4" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-bold">History</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{({ submitted: "Sent", needs_changes: "Review team asked for changes", approved: "Accredited", rejected: "Not approved", withdrawn: "Withdrawn", reopened: "Opened again", doc_checked: "Documents checked", chapter_note: "Chapter note" } as Record<string, string>)[h.action] ?? h.action}</span>
                <span className="text-muted"> · {when(h.created_at)} · version {h.revision}</span>
                {h.reasons.length > 0 && <span className="block text-muted">{h.reasons.map((r) => REASONS[r as keyof typeof REASONS] ?? r).join("; ")}</span>}
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {["draft", "submitted", "needs_changes"].includes(a.status) && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Withdraw this application…</summary>
          <p className="mt-1 text-sm text-muted">Your answers and files stay, so you can open it again later. Files are deleted 1 year after withdrawing.</p>
          <form action={withdrawApplication} className="mt-2"><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn btn-danger min-h-11" pendingText="Withdrawing…">Yes, withdraw</SubmitButton></form>
        </details>
      )}
    </div>
  );
}
