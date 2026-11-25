import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { Select, Text, TextArea } from "@/components/PartnerFields";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { PARTNER_DOC_MAX_BYTES, PHOTO_MAX_SIDE } from "@/lib/partner";
import { COMMISSION_HELP, MAX_OFFER_FILES, OFFER_DONE, OFFER_EDITABLE, OFFER_ERRORS, OFFER_LAST_STEP, OFFER_REASONS, OFFER_STATUS, VAT_BASIS, type OfferStatus } from "@/lib/offers";
import {
  FREE_TRIAL, MAX_MILESTONES, MAX_PACKAGES, MAX_REFERENCES, NO_GUARANTEE, PACKAGE_COLS, RATE_BASIS, REFERENCE_COLS, SERVICE_CATEGORIES,
  SERVICE_DECLARATION, SERVICE_ERRORS, SERVICE_FILE_KEYS, SERVICE_FILE_TYPES, SERVICE_MODES, SERVICE_REASONS, SERVICE_STEPS, serviceMissing, VERIFICATION,
  type PackageRow, type ReferenceRow, type ServiceOfferRow,
} from "@/lib/service-offers";
import { deleteDraftOffer, deleteOfferFile, reopenOffer, submitOffer, uploadOfferFile, withdrawOffer } from "../actions";
import { PackageSummary } from "@/components/ServicePackageSummary";
import { deletePackage, deleteReference, savePackage, saveReference, saveServiceStep } from "../service-actions";

type Doc = { id: string; doc_type: string; item_id: string | null; file_name: string; size_bytes: number; uploaded_at: string };
type History = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number };
type SP = { step?: string; pkg?: string; ref?: string; done?: string; error?: string };

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const tone = (s: OfferStatus) => ({ ok: "ok", warn: "warn", danger: "danger", info: "info" } as const)[OFFER_STATUS[s].tone];
const ACTION: Record<string, string> = { submitted: "Sent", needs_changes: "Review team asked for changes", selected: "Chosen as a Best Offer", not_selected: "Not chosen this time", withdrawn: "Withdrawn", reopened: "Opened again for changes" };
const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const yn = (b: boolean | null) => (b === true ? "yes" : b === false ? "no" : null);
const reasonText = (r: string) => SERVICE_REASONS[r as keyof typeof SERVICE_REASONS] ?? OFFER_REASONS[r as keyof typeof OFFER_REASONS] ?? r;
const DONE: Record<string, string> = {
  ...OFFER_DONE,
  started: "Your service offer is started. Fill in each screen; it saves as you go.",
  package_saved: "Package saved.", package_deleted: "Package removed.",
  reference_saved: "Past client saved. The national team may call them after you send the offer.", reference_deleted: "Past client removed.",
};

function SaveButtons({ step }: { step: number }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
      <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
      {step < OFFER_LAST_STEP && <button type="submit" name="intent" value="next" className="btn btn-primary min-h-11 w-full sm:w-auto">Save and continue →</button>}
    </div>
  );
}

/** The service provider's Best Offer form (Step 6): five screens, the same flow and buttons as the supplier form. */
export async function ServiceOffer({ o, docs, history, sp }: { o: ServiceOfferRow; docs: Doc[]; history: History[]; sp: SP }) {
  const { supabase } = await requireUser(`/partner-us/offers/${o.id}`);
  const [{ data: pkgRows }, { data: refRows }] = await Promise.all([
    supabase.from("service_offer_packages").select(PACKAGE_COLS).eq("offer_id", o.id).order("position"),
    supabase.from("service_offer_references").select(REFERENCE_COLS).eq("offer_id", o.id).order("position"),
  ]);
  const packages = (pkgRows ?? []) as unknown as PackageRow[];
  const refs = (refRows ?? []) as unknown as ReferenceRow[];
  const editable = OFFER_EDITABLE.includes(o.status);
  const step = editable ? Math.min(OFFER_LAST_STEP, Math.max(1, Number(sp.step) || 1)) : OFFER_LAST_STEP;
  const portfolioFiles = docs.filter((d) => d.doc_type === "portfolio").length;
  const missing = serviceMissing(o, packages, refs.length, portfolioFiles);
  const err = sp.error ? SERVICE_ERRORS[sp.error] ?? (sp.error === "not_supplier" ? SERVICE_ERRORS.not_provider : OFFER_ERRORS[sp.error]) ?? OFFER_ERRORS.failed : null;
  const done = sp.done ? DONE[sp.done] : null;
  const editPkg = step === 2 && editable ? (sp.pkg === "new" ? "new" : packages.find((x) => x.id === sp.pkg) ?? null) : null;
  const ep = editPkg && editPkg !== "new" ? editPkg : null;
  const editRef = step === 4 && editable ? (sp.ref === "new" ? "new" : refs.find((x) => x.id === sp.ref) ?? null) : null;
  const er = editRef && editRef !== "new" ? editRef : null;
  const base = `/partner-us/offers/${o.id}`;
  const stepInfo = SERVICE_STEPS[step - 1];

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › <Link href="/partner-us/offers" className="underline">My Best Offers</Link>
      </nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Best Offer ng service provider</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{o.title || "New service offer"}</h1>
        <div className="mt-2"><Notice tone={tone(o.status)}>Status: <strong>{OFFER_STATUS[o.status].label}</strong>{o.revision > 0 ? ` · version ${o.revision}` : ""}</Notice></div>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {(o.status === "needs_changes" || o.status === "not_selected") && (o.decision_reasons.length > 0 || o.decision_note) && (
        <section className="card space-y-2 border-2 border-warn p-4" aria-labelledby="reasons-h">
          <h2 id="reasons-h" className="text-lg font-bold">{o.status === "needs_changes" ? "What the review team asks you to change" : "Why it was not chosen this time"}</h2>
          <ul className="list-disc space-y-1 pl-5">{o.decision_reasons.map((r) => <li key={r}>{reasonText(r)}</li>)}</ul>
          {o.decision_note && <p className="whitespace-pre-line text-[15px]"><strong>Note:</strong> {o.decision_note}</p>}
        </section>
      )}
      {o.status === "selected" && (
        <section className="card space-y-2 border-2 border-ok p-4" aria-labelledby="sel-h">
          <h2 id="sel-h" className="text-lg font-bold text-ok">Your service offer was chosen as a Best Offer</h2>
          {o.selection_reason && <p className="whitespace-pre-line text-[15px]">{o.selection_reason}</p>}
          <p className="text-sm text-muted">The national team will contact you about the next steps. Territories and the commission agreement come later, in writing, with MarketplacePH Online Store. Nothing is final until then.</p>
        </section>
      )}
      {["not_selected", "withdrawn", "selected"].includes(o.status) && (
        <form action={reopenOffer} className="card space-y-2 p-4"><input type="hidden" name="id" value={o.id} />
          <p className="text-[15px]">{o.status === "selected" ? "Need to change rates or packages? Opening it for changes stops it being a Best Offer until the national team reviews the new version." : "You can change the offer and send it again as a new version."}</p>
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Opening…">{o.status === "selected" ? "Change this offer" : "Change and send again"}</SubmitButton>
        </form>
      )}

      {editable && (
        <nav aria-label="Offer steps" className="card p-3">
          <p className="px-1 text-sm font-semibold sm:hidden">Step {step} of {OFFER_LAST_STEP}: {stepInfo.title}</p>
          <div className="mx-1 mt-2 h-2 overflow-hidden rounded-full bg-bg-soft sm:hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${(step / OFFER_LAST_STEP) * 100}%` }} /></div>
          <ol className="mt-2 flex gap-1 overflow-x-auto sm:mt-0 sm:grid sm:grid-cols-5">
            {SERVICE_STEPS.map((s) => (
              <li key={s.n} className="shrink-0">
                <Link href={`${base}?step=${s.n}`} aria-current={s.n === step ? "step" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm ${s.n === step ? "bg-primary-soft font-bold text-primary" : "text-muted hover:bg-bg-soft"}`}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.n === step ? "bg-primary text-primary-fg" : "bg-bg-soft"}`}>{s.n}</span>
                  <span className="hidden sm:inline">{s.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {editable && (step === 1 || step === 3) && (
        <form action={saveServiceStep} className="card space-y-4 p-4 sm:p-6">
          <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={step} />
          <div>
            <h2 className="text-xl font-extrabold">{stepInfo.title}</h2>
            <p className="text-sm text-muted" lang="fil">{stepInfo.fil}. Puwedeng i-save at ituloy mamaya.</p>
          </div>
          {step === 1 && <>
            <Text name="title" label="Name of the offer" value={o.title} need max={150} placeholder="e.g. Monthly bookkeeping for small food businesses" help="A short name that says what you are offering." />
            <Select name="service_category" label="Kind of service" value={o.service_category} need options={Object.entries(SERVICE_CATEGORIES)} help="Offers of the same kind are compared with each other." />
            <Text name="profession" label="Your profession or trade" value={o.profession} need max={150} placeholder="e.g. Bookkeeping firm led by a CPA; licensed electrician" />
            <TextArea name="qualifications" label="Qualifications and experience" value={o.qualifications} need max={1500} rows={4} placeholder="e.g. CPA since 2015; 2 bookkeepers with TESDA NC III; 120 MSME clients served" help="Training, years of work, number of clients, team size. Ano ang kwalipikasyon at karanasan ninyo?" />
            <fieldset className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <legend className="px-1 font-bold">Licence</legend>
              <Select name="license_required" label="Does this service need a professional licence or government accreditation?" value={yn(o.license_required)} need options={[["yes", "Yes"], ["no", "No"]]} help="Halimbawa: PRC (accountant, engineer), TESDA, DOLE, LTFRB, BFP, DENR." />
              <div className="grid gap-4 sm:grid-cols-3">
                <Text name="license_body" label="Who issued it (if yes)" value={o.license_body} max={120} placeholder="e.g. PRC" />
                <Text name="license_no" label="Licence number (if yes)" value={o.license_no} max={60} />
                <Text name="license_valid_until" label="Valid until (if yes)" value={o.license_valid_until} type="date" max={10} />
              </div>
              <p className="text-xs text-muted">Upload a copy of the licence on screen 4. It is encrypted and only the national team can open it.</p>
            </fieldset>
            <Text name="valid_until" label="Rates valid until" value={o.valid_until} need type="date" max={10} help="Hanggang kailan ninyo kayang ibigay ang singil na ito?" />
            <Select name="vat_basis" label="VAT" value={o.vat_basis} need options={Object.entries(VAT_BASIS)} help="So members' rates are compared fairly, we add 12% VAT to rates typed without it." />
            <Select name="service_mode" label="On-site or remote" value={o.service_mode} need options={Object.entries(SERVICE_MODES)} />
            <TextArea name="serviceable_areas" label="Areas you serve" value={o.serviceable_areas} need max={1000} rows={3} placeholder="e.g. On-site in Quezon City, Manila and Caloocan; remote work nationwide" help="Isulat ang mga lungsod, bayan o probinsya, o kung online sa buong bansa." />
          </>}
          {step === 3 && <>
            <Select name="free_trial" label="Free consultation or trial for members" value={o.free_trial} need options={Object.entries(FREE_TRIAL)} help="Chapter testers may try it and report back to the national team." />
            <Text name="trial_terms" label="Consultation or trial details (optional)" value={o.trial_terms} max={500} placeholder="e.g. 30-minute video call; first month's books free for up to 50 entries" />
            <TextArea name="availability" label="Availability" value={o.availability} need max={500} rows={2} placeholder="e.g. Monday to Saturday, 8 am to 6 pm" help="Days and hours you work, and any busy seasons." />
            <div className="grid gap-4 sm:grid-cols-3">
              <Text name="lead_time_days" label="Days from booking until work starts" value={num(o.lead_time_days)} need max={3} inputMode="numeric" placeholder="e.g. 3" />
              <Text name="response_hours" label="Hours to reply to a member" value={num(o.response_hours)} need max={3} inputMode="numeric" placeholder="e.g. 24" help="Service level: how fast you answer." />
              <Text name="monthly_clients" label="New members you can take per month (optional)" value={num(o.monthly_clients)} max={6} inputMode="numeric" placeholder="e.g. 10" />
            </div>
            <TextArea name="service_levels" label="Other service levels (optional)" value={o.service_levels} max={1000} rows={2} placeholder="e.g. Repairs within 48 hours in Metro Manila; monthly report by day 10" />
            <div role="note" className="rounded-xl border border-line bg-bg-soft p-3 text-sm">
              <p className="font-semibold">{NO_GUARANTEE.en}</p>
              <p className="mt-1 text-muted" lang="fil">{NO_GUARANTEE.tl}</p>
            </div>
            <TextArea name="correction_policy" label="How you correct mistakes" value={o.correction_policy} need max={1000} rows={3} placeholder="e.g. Errors we made are corrected free within 5 working days of the member telling us" help="Re-performance: ano ang gagawin ninyo kung may mali sa trabaho?" />
            <TextArea name="refund_policy" label="Refund for work not delivered" value={o.refund_policy} need max={1000} rows={3} placeholder="e.g. If a deliverable in the scope is not met, the unmet part is refunded in proportion" help="Proportionate refund based on the scope of work. Refunds are settled by MarketplacePH Online Store or between you and the member, never by flameph.org." />
            <TextArea name="confidentiality" label="Confidentiality and data handling" value={o.confidentiality} need max={1000} rows={3} placeholder="e.g. Records kept on an encrypted drive; staff sign an NDA; files deleted 1 year after the contract ends" help="Paano ninyo iniingatan ang impormasyon at mga dokumento ng member? (Data Privacy Act)" />
            <Select name="handles_personal_data" label="Will you handle members' personal data (IDs, payroll, customer lists)?" value={yn(o.handles_personal_data)} need options={[["yes", "Yes"], ["no", "No"]]} />
          </>}
          <SaveButtons step={step} />
        </form>
      )}

      {editable && step === 2 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="pkg-h">
          <div>
            <h2 id="pkg-h" className="text-xl font-extrabold">Packages and rates</h2>
            <p className="text-sm text-muted" lang="fil">Ilagay ang bawat package, kung ano ang kasama at hindi kasama, at ang singil para sa member. Hanggang {MAX_PACKAGES} package.</p>
          </div>
          {packages.length === 0 && !editPkg && <Notice tone="info">No packages yet. Add your first package below.</Notice>}
          {packages.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {packages.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <PackageSummary p={p} vat={o.vat_basis} />
                  <span className="flex shrink-0 gap-2">
                    <Link href={`${base}?step=2&pkg=${p.id}#pkg-form`} className="btn btn-outline min-h-11 px-3 text-sm">Edit</Link>
                    <form action={deletePackage}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="package_id" value={p.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {editPkg ? (
            <form id="pkg-form" action={savePackage} className="scroll-mt-24 space-y-4 rounded-xl border-2 border-primary p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} />{ep && <input type="hidden" name="package_id" value={ep.id} />}
              <h3 className="text-lg font-extrabold">{ep ? `Edit: ${ep.name}` : "Add a package"}</h3>
              <fieldset className="space-y-4">
                <legend className="font-bold">Scope of work</legend>
                <Text name="name" label="Package name" value={ep?.name} need max={150} placeholder="e.g. Monthly bookkeeping, up to 150 entries" />
                <TextArea name="description" label="Short description (optional)" value={ep?.description} max={1000} rows={2} />
                <TextArea name="scope" label="What is included (deliverables)" value={ep?.scope} need max={2000} rows={4} placeholder="e.g. Recording of sales, purchases and expenses; monthly BIR 2550M and quarterly 2551Q forms prepared; monthly profit and loss report" help="List what the member gets. Ano ang kasama sa package?" />
                <TextArea name="exclusions" label="What is NOT included (optional)" value={ep?.exclusions} max={1000} rows={2} placeholder="e.g. Audit, tax cases, BIR penalties, filing fees" help="Clear exclusions prevent disputes later." />
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">Rates (₱)</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select name="rate_basis" label="How it is priced" value={ep?.rate_basis ?? "package"} need options={Object.entries(RATE_BASIS).map(([k, v]) => [k, `${v.label} — ${v.help}`])} />
                  <Text name="unit_label" label="The unit (for per-unit rates)" value={ep?.unit_label} max={60} placeholder="e.g. per employee, per 100 flyers" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Text name="normal_rate" label="Normal rate" value={ep ? num(ep.normal_rate) : ""} max={14} inputMode="decimal" placeholder="3500" help="Your usual rate for anyone." />
                  <Text name="member_rate" label="FLAME PH member rate" value={ep ? num(ep.member_rate) : ""} need max={14} inputMode="decimal" placeholder="2800" help="Singil para sa member." />
                  <Text name="min_units" label="Minimum (hours, months, units)" value={ep ? num(ep.min_units) : ""} max={6} inputMode="numeric" placeholder="1" help="e.g. at least 3 months." />
                </div>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">Time, milestones and acceptance</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="duration_days" label="Days to finish (optional)" value={ep ? num(ep.duration_days) : ""} max={3} inputMode="numeric" placeholder="e.g. 30" />
                  <Text name="revisions_included" label="Revisions included" value={ep ? num(ep.revisions_included) : ""} max={2} inputMode="numeric" placeholder="e.g. 2" help="How many rounds of changes are free." />
                </div>
                <div>
                  <p className="label">Milestones (optional)</p>
                  <p className="field-help">What is delivered, and by which day after the start. Example: &quot;Chart of accounts set up&quot;, day 7.</p>
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: MAX_MILESTONES }, (_, i) => (
                      <div key={i} className="grid grid-cols-[1fr_6rem] gap-2">
                        <input name={`ms_title_${i}`} aria-label={`Milestone ${i + 1}: what is delivered`} defaultValue={ep?.milestones[i]?.title ?? ""} maxLength={150} placeholder={`Milestone ${i + 1}`} className="input" />
                        <input name={`ms_days_${i}`} aria-label={`Milestone ${i + 1}: by day`} defaultValue={num(ep?.milestones[i]?.due_days)} inputMode="numeric" maxLength={3} placeholder="Day" className="input" />
                      </div>
                    ))}
                  </div>
                </div>
                <TextArea name="acceptance_criteria" label="How the member checks it is done (acceptance criteria)" value={ep?.acceptance_criteria} need max={1500} rows={3} placeholder="e.g. Books closed and reports emailed by day 10 of the next month; BIR forms ready 3 days before the deadline" help="Measurable and checkable: dates, numbers, documents. Not &quot;100% satisfaction&quot;." />
              </fieldset>
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
                <Link href={`${base}?step=2`} className="btn btn-outline min-h-11 w-full sm:w-auto">Cancel</Link>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save package</SubmitButton>
              </div>
            </form>
          ) : packages.length < MAX_PACKAGES ? (
            <Link href={`${base}?step=2&pkg=new#pkg-form`} className="btn btn-flame min-h-11 w-full sm:w-auto">+ Add a package</Link>
          ) : <Notice tone="info">{SERVICE_ERRORS.package_limit}</Notice>}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`${base}?step=1`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`${base}?step=3`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {editable && step === 4 && (
        <section className="card space-y-5 p-4 sm:p-6" aria-labelledby="proof-h">
          <div>
            <h2 id="proof-h" className="text-xl font-extrabold">Past clients and files</h2>
            <p className="text-sm text-muted" lang="fil">Ilista ang mga dating kliyente na puwedeng tawagan ng national team, at mag-upload ng halimbawa ng trabaho. Naka-encrypt at pribado ang mga file.</p>
          </div>

          <form action={saveServiceStep} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
            <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={4} />
            <TextArea name="portfolio" label="Your portfolio" value={o.portfolio} max={1500} rows={3} placeholder="e.g. 40 sari-sari stores and 12 bakeries since 2019; sample report attached; www.example.ph/work" help="Describe past work or give links. A description or at least one sample file below is needed to send." />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save portfolio</SubmitButton>
          </form>

          <div className="space-y-3">
            <h3 className="font-bold">Past clients we can call ({refs.length} of {MAX_REFERENCES})</h3>
            <p className="text-sm text-muted">After you send the offer, the national team may call them about your work. This is how feedback from outside FLAME PH is verified. Ratings from members you did confirmed deals with on flameph.org are added automatically.</p>
            {refs.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {refs.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0">
                      <span className="block break-words font-bold">{r.client_name}</span>
                      <span className="block break-words text-sm">{r.work_done}{r.completed_on ? ` · ${day(r.completed_on)}` : ""}</span>
                      <span className="block break-words text-xs text-muted">{r.client_contact} · {VERIFICATION[r.verification].label}</span>
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <Link href={`${base}?step=4&ref=${r.id}#ref-form`} className="btn btn-outline min-h-11 px-3 text-sm">Edit</Link>
                      <form action={deleteReference}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="reference_id" value={r.id} />
                        <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {editRef ? (
              <form id="ref-form" action={saveReference} className="scroll-mt-24 space-y-3 rounded-xl border-2 border-primary p-3 sm:p-4">
                <input type="hidden" name="id" value={o.id} />{er && <input type="hidden" name="reference_id" value={er.id} />}
                <h4 className="font-extrabold">{er ? `Edit: ${er.client_name}` : "Add a past client"}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="client_name" label="Client's business or name" value={er?.client_name} need max={150} />
                  <Text name="client_contact" label="Phone or email" value={er?.client_contact} need max={150} help="Only the national team sees this." />
                </div>
                <TextArea name="work_done" label="What you did for them" value={er?.work_done} need max={500} rows={2} placeholder="e.g. Monthly bookkeeping and BIR filing since 2023" />
                <Text name="completed_on" label="When (optional)" value={er?.completed_on} type="date" max={10} />
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="client_consent" value="yes" required defaultChecked={er?.client_consent} className="check mt-0.5" /><span className="text-[15px]">This client agreed that the FLAME PH national team may contact them about my work.<span className="mt-1 block text-sm text-muted" lang="fil">Pumayag ang kliyenteng ito na sila ay tawagan.</span></span></label>
                {er && er.verification !== "pending" && <p className="text-xs text-muted">Changing the details sends it back to &quot;not checked yet&quot;.</p>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Link href={`${base}?step=4`} className="btn btn-outline min-h-11 w-full sm:w-auto">Cancel</Link>
                  <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save past client</SubmitButton>
                </div>
              </form>
            ) : refs.length < MAX_REFERENCES ? (
              <Link href={`${base}?step=4&ref=new#ref-form`} className="btn btn-flame min-h-11 w-full sm:w-auto">+ Add a past client</Link>
            ) : <Notice tone="info">{SERVICE_ERRORS.reference_limit}</Notice>}
          </div>

          <div className="space-y-3">
            <h3 className="font-bold">Files ({docs.length} of {MAX_OFFER_FILES})</h3>
            {docs.length < MAX_OFFER_FILES ? (
              <form action={uploadOfferFile} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
                <input type="hidden" name="id" value={o.id} />
                <div className="field">
                  <label htmlFor="doc_type" className="label">What kind of file is this?</label>
                  <select id="doc_type" name="doc_type" required className="input" defaultValue={portfolioFiles ? "" : "portfolio"}>
                    <option value="">Choose…</option>
                    {SERVICE_FILE_KEYS.map((k) => <option key={k} value={k}>{SERVICE_FILE_TYPES[k].label}</option>)}
                  </select>
                  <p className="field-help">{SERVICE_FILE_KEYS.map((k) => `${SERVICE_FILE_TYPES[k].label}: ${SERVICE_FILE_TYPES[k].help}`).join(" ")}</p>
                </div>
                <div className="field">
                  <label htmlFor="file" className="label">File</label>
                  <ShrinkPhotoInput id="file" maxBytes={PARTNER_DOC_MAX_BYTES} maxSide={PHOTO_MAX_SIDE} />
                  <p className="field-help">PDF, JPG, PNG or WEBP, up to 4 MB. Photos are made smaller on your phone before sending.</p>
                </div>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Upload securely</SubmitButton>
              </form>
            ) : <Notice tone="info">{OFFER_ERRORS.too_many}</Notice>}
            {docs.length === 0 ? <p className="text-sm text-muted">No files yet.</p> : (
              <ul className="divide-y divide-line">
                {docs.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{SERVICE_FILE_TYPES[x.doc_type as keyof typeof SERVICE_FILE_TYPES]?.label ?? x.doc_type}</span>
                      <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                    <form action={deleteOfferFile}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="doc_id" value={x.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Deleting…">Delete</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">For your privacy you can&apos;t open the files here; only the national review team can. To replace one, delete it and upload again.</p>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`${base}?step=3`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`${base}?step=5`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {step === OFFER_LAST_STEP && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="send-h">
          <div>
            <h2 id="send-h" className="text-xl font-extrabold">{editable ? "Commission and send" : "Your offer"}</h2>
            {editable && <p className="text-sm text-muted" lang="fil">Ilagay ang mungkahing commission, suriin ang lahat, at ipadala.</p>}
          </div>
          <PartnerMoneyNotice />
          {editable ? (
            <form action={saveServiceStep} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
              <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={OFFER_LAST_STEP} />
              <Text name="commission_pct" label="Proposed commission (% of net sales)" value={num(o.commission_pct)} need max={6} inputMode="decimal" placeholder="e.g. 12" help={`${COMMISSION_HELP} The program's starting target for services is 12%; yours may differ.`} />
              <TextArea name="commission_note" label="Other benefits for members or chapters (optional)" value={o.commission_note} max={500} rows={2} placeholder="e.g. Free tax-filing workshop for each chapter once a year" />
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
            </form>
          ) : (
            <p className="text-[15px]">Proposed commission: <strong>{o.commission_pct !== null ? `${Number(o.commission_pct)}% of net sales` : "—"}</strong>{o.commission_note ? ` · ${o.commission_note}` : ""}<span className="block text-xs text-muted">{COMMISSION_HELP}</span></p>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {([
              ["Kind of service", o.service_category ? SERVICE_CATEGORIES[o.service_category] : null], ["Profession or trade", o.profession],
              ["Qualifications and experience", o.qualifications],
              ["Licence", o.license_required === null ? null : o.license_required ? `${o.license_body ?? "—"} no. ${o.license_no ?? "—"}${o.license_valid_until ? `, valid until ${day(o.license_valid_until)}` : ""}` : "Not needed for this service"],
              ["Rates valid until", day(o.valid_until)], ["VAT", o.vat_basis ? VAT_BASIS[o.vat_basis] : null],
              ["On-site or remote", o.service_mode ? SERVICE_MODES[o.service_mode] : null], ["Areas you serve", o.serviceable_areas],
              ["Free consultation or trial", o.free_trial ? `${FREE_TRIAL[o.free_trial]}${o.trial_terms ? `. ${o.trial_terms}` : ""}` : null],
              ["Availability", o.availability ? `${o.availability}${o.monthly_clients ? ` · ${o.monthly_clients} new members a month` : ""}` : null],
              ["Work starts within", o.lead_time_days !== null ? `${o.lead_time_days} days of booking` : null], ["Replies within", o.response_hours !== null ? `${o.response_hours} hours` : null],
              ["Other service levels", o.service_levels], ["Correcting mistakes", o.correction_policy], ["Refund for work not delivered", o.refund_policy],
              ["Confidentiality and data handling", o.confidentiality], ["Handles members' personal data", o.handles_personal_data === null ? null : o.handles_personal_data ? "Yes" : "No"],
              ["Portfolio", o.portfolio], ["Past clients", refs.length ? `${refs.length} listed` : null], ["Files", docs.length ? `${docs.length} file(s)` : null],
            ] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="whitespace-pre-line break-words">{v || <span className="text-muted">—</span>}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="font-bold">Packages ({packages.length})</h3>
            {packages.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">{packages.map((p) => <li key={p.id} className="p-3"><PackageSummary p={p} vat={o.vat_basis} full /></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-muted">The national team compares member rates (with VAT) for the same kind of package, your qualifications, service levels and results from past clients.</p>
          </div>

          {editable && (missing.length > 0 ? (
            <div role="status" className="rounded-xl bg-warn-soft p-4 text-warn">
              <p className="font-bold">Still needed before you can send ({missing.length}):</p>
              <ul className="mt-2 space-y-1">{missing.map((m) => <li key={m.what}><Link href={`${base}?step=${m.step}`} className="font-semibold underline">{m.what}</Link> <span className="text-sm">(step {m.step})</span></li>)}</ul>
            </div>
          ) : (
            <form action={submitOffer} className="space-y-4">
              <input type="hidden" name="id" value={o.id} />
              <fieldset className="space-y-2 rounded-xl border border-line p-3 sm:p-4">
                <legend className="px-1 font-bold">Declaration</legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="declaration" value="yes" required className="check mt-0.5" /><span>{SERVICE_DECLARATION.en}<span className="mt-1 block text-sm text-muted" lang="fil">{SERVICE_DECLARATION.tl}</span></span></label>
              </fieldset>
              <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Sending…">{o.revision > 0 ? `Send as version ${o.revision + 1}` : "Send my service offer"}</SubmitButton>
            </form>
          ))}
          {o.status === "submitted" && <Notice tone="info">The national team is comparing and scoring your offer and may call your past clients. We will tell you in your Inbox and by email. You can&apos;t change it while it is being reviewed.</Notice>}
          {editable && <div className="border-t border-line pt-4"><Link href={`${base}?step=4`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back to past clients and files</Link></div>}
        </section>
      )}

      {history.length > 0 && (
        <section className="card p-4" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-bold">History</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{ACTION[h.action] ?? h.action}</span>
                <span className="text-muted"> · {when(h.created_at)}{h.revision > 0 ? ` · version ${h.revision}` : ""}</span>
                {h.reasons.length > 0 && <span className="block text-muted">{h.reasons.map(reasonText).join("; ")}</span>}
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {o.status === "draft" && o.revision === 0 && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Delete this draft…</summary>
          <p className="mt-1 text-sm text-muted">The draft, its packages, past clients and files are deleted. This can&apos;t be undone.</p>
          <form action={deleteDraftOffer} className="mt-2"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-danger min-h-11" pendingText="Deleting…">Yes, delete the draft</SubmitButton></form>
        </details>
      )}
      {(["submitted", "needs_changes", "selected"].includes(o.status) || (o.status === "draft" && o.revision > 0)) && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Withdraw this offer…</summary>
          <p className="mt-1 text-sm text-muted">{o.status === "selected" ? "It stops being a Best Offer. " : ""}Your answers and files stay, so you can open it again later. Files are deleted 1 year after withdrawing.</p>
          <form action={withdrawOffer} className="mt-2"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-danger min-h-11" pendingText="Withdrawing…">Yes, withdraw</SubmitButton></form>
        </details>
      )}
    </div>
  );
}
