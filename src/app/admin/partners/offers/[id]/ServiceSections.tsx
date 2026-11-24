import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { COMMISSION_HELP, VAT_BASIS } from "@/lib/offers";
import {
  FREE_TRIAL, SERVICE_CATEGORIES, SERVICE_MODES, VERIFICATION, type PackageRow, type ReferenceRow, type ServiceOfferRow, type TrackRecord,
} from "@/lib/service-offers";
import { PackageSummary } from "@/components/ServicePackageSummary";
import { checkReference } from "../actions";

// The service parts of Admin > Partners > offer review (Step 6): terms, packages, customer results and the past
// clients the national team calls. Scoring, the decision and the history are shared with supplier offers.

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="whitespace-pre-line break-words">{v || <span className="text-muted">—</span>}</dd></div>;
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

export function ServiceTerms({ o, packages }: { o: ServiceOfferRow; packages: PackageRow[] }) {
  const expired = o.license_required && o.license_valid_until && o.license_valid_until < today();
  return (
    <>
      <section className="card space-y-3 p-4" aria-labelledby="terms-h">
        <h2 id="terms-h" className="text-lg font-bold">Service, qualifications and standards</h2>
        <PartnerMoneyNotice compact />
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item k="Proposed commission" v={o.commission_pct !== null ? <>{Number(o.commission_pct)}% of net sales<span className="block text-xs text-muted">{COMMISSION_HELP}</span></> : null} />
          <Item k="Other benefits for members or chapters" v={o.commission_note} />
          <Item k="Kind of service" v={o.service_category ? SERVICE_CATEGORIES[o.service_category] : null} /><Item k="Profession or trade" v={o.profession} />
          <Item k="Qualifications and experience" v={o.qualifications} />
          <Item k="Licence" v={o.license_required === null ? null : o.license_required
            ? <>{o.license_body} no. {o.license_no}{o.license_valid_until ? `, valid until ${day(o.license_valid_until)}` : ", no expiry date given"}{expired && <span className="block font-bold text-danger">Expired</span>}</>
            : "Provider says no licence is needed"} />
          <Item k="Portfolio" v={o.portfolio} />
          <Item k="Rates valid until" v={day(o.valid_until)} /><Item k="VAT" v={o.vat_basis ? VAT_BASIS[o.vat_basis] : null} />
          <Item k="On-site or remote" v={o.service_mode ? SERVICE_MODES[o.service_mode] : null} /><Item k="Areas served" v={o.serviceable_areas} />
          <Item k="Free consultation or trial" v={o.free_trial ? `${FREE_TRIAL[o.free_trial]}${o.trial_terms ? `. ${o.trial_terms}` : ""}` : null} />
          <Item k="Availability" v={o.availability ? `${o.availability}${o.monthly_clients ? ` · ${o.monthly_clients} new members a month` : ""}` : null} />
          <Item k="Service levels" v={[o.response_hours !== null ? `Replies within ${o.response_hours} hours` : null, o.lead_time_days !== null ? `starts within ${o.lead_time_days} days` : null, o.service_levels].filter(Boolean).join("; ")} />
          <Item k="Correcting mistakes (re-performance)" v={o.correction_policy} /><Item k="Refund for work not delivered" v={o.refund_policy} />
          <Item k="Confidentiality and data handling" v={<>{o.confidentiality}{o.handles_personal_data && <span className="block text-xs font-bold text-warn">Handles members&apos; personal data</span>}</>} />
        </dl>
      </section>
      <section className="card p-4" aria-labelledby="pkg-h">
        <h2 id="pkg-h" className="text-lg font-bold">Packages ({packages.length})</h2>
        <ul className="mt-2 divide-y divide-line">{packages.map((p) => <li key={p.id} className="py-3 text-[15px]"><PackageSummary p={p} vat={o.vat_basis} full />{p.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{p.description}</p>}</li>)}</ul>
      </section>
    </>
  );
}

/** Customer results: confirmed FLAME PH deals, complaints, chapter trials and verified past clients. */
export function TrackRecordCard({ tr }: { tr: TrackRecord | undefined }) {
  if (!tr) return null;
  const tags = Object.entries(tr.tags).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <section className="card space-y-2 p-4" aria-labelledby="results-h">
      <h2 id="results-h" className="text-lg font-bold">Customer results</h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Item k="Confirmed FLAME PH deals (both sides confirmed)" v={tr.shared ? <>{tr.deals} deal(s){tr.ratingAvg !== null ? ` · members rated ${tr.ratingAvg} of 5 (${tr.ratingCount})` : " · no ratings yet"}{tags.length > 0 && <span className="block text-xs text-muted">Endorsed for: {tags.map(([t, n]) => `${t.replace(/_/g, " ")} (${n})`).join(", ")}</span>}</> : <span className="text-muted">Not shared (records switch is off) or none yet</span>} />
        <Item k="Past clients called by the team" v={tr.referencesTotal ? `${tr.referencesVerified} of ${tr.referencesTotal} verified${tr.referenceRating !== null ? ` · clients rated ${tr.referenceRating} of 5` : ""}` : "None listed"} />
        <Item k="Complaints from members (Step 5)" v={tr.complaints ? <>{tr.complaints} total{tr.complaintsOpen ? <span className="font-bold text-warn"> · {tr.complaintsOpen} still open</span> : ""}</> : "None"} />
        <Item k="Trials by chapter testers" v={tr.trials ? <>{tr.trialAvg} of 25 average ({tr.trials}){tr.safety ? <span className="block text-xs font-bold text-danger">{tr.safety} safety concern(s)</span> : null}</> : "None yet"} />
      </dl>
      <p className="text-xs text-muted">Deal amounts are never shown. Ratings come only from deals both members confirmed.</p>
    </section>
  );
}

/** The provider's past clients, and the result of each call (national team only; never your own offer). */
export function ReferencesSection({ id, refs, canCheck, who }: { id: string; refs: ReferenceRow[]; canCheck: boolean; who: (uid: string | null) => string }) {
  return (
    <section id="references" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="refs-h">
      <h2 id="refs-h" className="text-lg font-bold">Past clients to call ({refs.length})</h2>
      <p className="text-sm text-muted">The provider says each client agreed to be contacted. Call or email, ask whether the work was delivered as promised, then record the result. Contact details are private: do not share them.</p>
      {refs.length === 0 ? <p className="text-sm text-muted">None listed.</p> : (
        <ul className="divide-y divide-line">
          {refs.map((r) => (
            <li key={r.id} className="space-y-2 py-3">
              <div className="min-w-0 text-[15px]">
                <p className="break-words font-bold">{r.client_name} <span className="font-normal text-muted">· {r.client_contact}</span></p>
                <p className="break-words text-sm">{r.work_done}{r.completed_on ? ` · ${day(r.completed_on)}` : ""}</p>
                <p className={`text-sm font-semibold ${r.verification === "verified" ? "text-ok" : r.verification === "not_verified" ? "text-warn" : "text-muted"}`}>
                  {VERIFICATION[r.verification].label}{r.client_rating ? ` · client rated ${r.client_rating} of 5` : ""}{r.verified_at ? ` · ${who(r.verified_by)}, ${when(r.verified_at)}` : ""}
                </p>
                {r.verification_note && <p className="whitespace-pre-line text-sm text-muted">{r.verification_note}</p>}
              </div>
              {canCheck && (
                <details className="rounded-xl border border-line px-3 py-1">
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{r.verification === "pending" ? "Record the call…" : "Update the result…"}</summary>
                  <form action={checkReference} className="space-y-3 pb-3">
                    <input type="hidden" name="id" value={id} /><input type="hidden" name="reference_id" value={r.id} />
                    <fieldset className="grid gap-2 sm:grid-cols-2">
                      <legend className="sr-only">Result</legend>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="verification" value="verified" required className="check" /><span className="font-semibold">Verified: the client confirmed the work</span></label>
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="verification" value="not_verified" className="check" /><span className="font-semibold">Could not verify</span></label>
                    </fieldset>
                    <div className="field">
                      <label htmlFor={`rating-${r.id}`} className="label text-sm">Client&apos;s rating of the work (if verified)</label>
                      <select id={`rating-${r.id}`} name="client_rating" className="input" defaultValue=""><option value="">No rating given</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} of 5</option>)}</select>
                    </div>
                    <div className="field">
                      <label htmlFor={`vnote-${r.id}`} className="label text-sm">What the client said, or why it could not be verified</label>
                      <textarea id={`vnote-${r.id}`} name="verification_note" required maxLength={1000} rows={2} className="input" placeholder="e.g. Called the owner on 24 Nov: reports always on time, one error corrected within 2 days." />
                    </div>
                    <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save result</SubmitButton>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
