import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SigProductSummary } from "@/components/SignatureProductSummary";
import { COMMISSION_HELP, SAMPLES, VAT_BASIS } from "@/lib/offers";
import {
  FORMULA_OWNERSHIP, IP_TERMS, PACKAGING_SUPPLY, REVIEW_ITEMS, REVIEW_TYPE_LABEL, reviewState, SIGNATURE_CATEGORIES,
  type ReviewRow, type ReviewType, type SigProductRow, type SignatureOfferRow, type SiteRow,
} from "@/lib/signature";
import { decideProduct, saveSignatureReview } from "../actions";

// The FLAME Signature parts of the national team's review page (Step 7): proposal terms, plants with their FDA
// License to Operate, products with approve / not approve, and the regulatory and legal reviews with their checklists.

const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="whitespace-pre-line break-words">{v || <span className="text-muted">—</span>}</dd></div>;

export function SignatureTerms({ o, sites }: { o: SignatureOfferRow; sites: SiteRow[] }) {
  return (
    <>
      <section className="card space-y-3 p-4" aria-labelledby="sig-terms-h">
        <h2 id="sig-terms-h" className="text-lg font-bold">Proposal terms</h2>
        <PartnerMoneyNotice compact />
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item k="Kind of products" v={o.signature_category ? SIGNATURE_CATEGORIES[o.signature_category] : null} />
          <Item k="Who owns the formula" v={o.formulation_ownership ? `${FORMULA_OWNERSHIP[o.formulation_ownership].label}${o.formulation_note ? `. ${o.formulation_note}` : ""}` : null} />
          <Item k="Can develop or adjust formulas" v={o.rnd_support === null ? null : o.rnd_support ? "Yes" : "No"} />
          <Item k="Packaging and labels supplied by" v={o.packaging_supply ? PACKAGING_SUPPLY[o.packaging_supply] : null} />
          <Item k="Proposed commission" v={o.commission_pct !== null ? <>{Number(o.commission_pct)}% of net sales<span className="block text-xs text-muted">{COMMISSION_HELP}</span></> : null} />
          <Item k="Other benefits for members or chapters" v={o.commission_note} />
          <Item k="Toll prices valid until" v={day(o.valid_until)} /><Item k="VAT" v={o.vat_basis ? VAT_BASIS[o.vat_basis] : null} />
          <Item k="Delivers finished goods to" v={o.serviceable_areas} />
          <Item k="Days from purchase order to delivery" v={o.lead_time_days !== null ? `${o.lead_time_days} days` : null} />
          <Item k="Sample batches" v={o.sample_availability ? `${SAMPLES[o.sample_availability]}${o.sample_terms ? `. ${o.sample_terms}` : ""}` : null} />
          <Item k="Quality testing of each batch" v={o.qc_testing} /><Item k="Lab partner" v={o.lab_partner} />
          <Item k="Batch records and traceability" v={o.traceability} />
          <Item k="Keeps batch records for" v={o.batch_record_years !== null ? `${o.batch_record_years} year(s)` : null} />
          <Item k="Recall plan" v={o.recall_plan} /><Item k="Recall contact" v={o.recall_contact} />
          <Item k="Last mock recall" v={day(o.mock_recall_on)} />
          <Item k="Licence terms accepted" v={o.ip_terms_accepted_at ? `${o.ip_terms_version ?? ""} on ${when(o.ip_terms_accepted_at)}` : "Not yet"} />
        </dl>
        <details className="rounded-xl border border-line px-3 py-1">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Licence terms the manufacturer accepted</summary>
          <ol className="list-decimal space-y-1 pb-3 pl-5 text-sm">{IP_TERMS.en.map((t) => <li key={t}>{t}</li>)}</ol>
        </details>
      </section>

      <section className="card p-4" aria-labelledby="sig-sites-h">
        <h2 id="sig-sites-h" className="text-lg font-bold">Manufacturing plants ({sites.length})</h2>
        <ul className="mt-2 divide-y divide-line">
          {sites.map((s) => {
            const expired = !!s.lto_valid_until && s.lto_valid_until < today();
            return (
              <li key={s.id} className="space-y-0.5 py-3 text-[15px]">
                <p className="break-words font-bold">{s.site_name} <span className="font-normal text-muted">· {s.site_type === "own" ? "own plant" : `contract plant run by ${s.operator_name}`}</span></p>
                <p className="break-words text-sm">{s.address}, {s.place_label}</p>
                <p className={`text-sm ${expired || !s.lto_no ? "font-semibold text-warn" : ""}`}>FDA License to Operate: {s.lto_no ? `${s.lto_no}, valid until ${day(s.lto_valid_until)}${expired ? " (EXPIRED)" : ""}` : "none given"}</p>
                <p className="text-sm text-muted">Capacity {s.monthly_capacity}{s.production_lines ? ` · lines: ${s.production_lines}` : ""}{s.certifications ? ` · ${s.certifications}` : ""}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Products with the national team's approval. Approving needs the regulatory review of this version cleared. */
export function SignatureProducts({ id, o, products, sites, canDecide, regulatoryCleared }: {
  id: string; o: SignatureOfferRow; products: SigProductRow[]; sites: SiteRow[]; canDecide: boolean; regulatoryCleared: boolean;
}) {
  const siteName = (sid: string | null) => sites.find((s) => s.id === sid)?.site_name ?? null;
  return (
    <section id="sig-products" className="card scroll-mt-24 p-4" aria-labelledby="sig-prod-h">
      <h2 id="sig-prod-h" className="text-lg font-bold">Products ({products.length})</h2>
      <p className="text-sm text-muted">Only approved products can go into a FLAME Signature licence and carry the mark.{canDecide && !regulatoryCleared ? " Clear the regulatory review of this version first to approve products." : ""}</p>
      <ul className="mt-2 divide-y divide-line">
        {products.map((p) => (
          <li key={p.id} className="space-y-2 py-3">
            <SigProductSummary p={p} vat={o.vat_basis} site={siteName(p.site_id)} showApproval />
            {p.description && <p className="whitespace-pre-line break-words text-sm text-muted">{p.description}</p>}
            {canDecide && (
              <form action={decideProduct} className="flex flex-col gap-2 rounded-xl bg-bg-soft p-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="product_id" value={p.id} />
                <div className="field sm:w-56">
                  <label htmlFor={`ap-${p.id}`} className="label text-sm">Decision</label>
                  <select id={`ap-${p.id}`} name="approval" required defaultValue="" className="input">
                    <option value="" disabled>Choose…</option>
                    <option value="approved" disabled={!regulatoryCleared}>Approve for FLAME Signature</option>
                    <option value="not_approved">Not approved</option>
                  </select>
                </div>
                <div className="field flex-1">
                  <label htmlFor={`an-${p.id}`} className="label text-sm">Note to the manufacturer (needed if not approved)</label>
                  <input id={`an-${p.id}`} name="approval_note" maxLength={1000} className="input" />
                </div>
                <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Save</SubmitButton>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The regulatory and legal reviews of this version, with a form for each. Both must clear before it can be chosen. */
export function SignatureReviews({ id, revision, reviews, canReview, who }: { id: string; revision: number; reviews: ReviewRow[]; canReview: boolean; who: (uid: string | null) => string }) {
  const state = reviewState(reviews, revision);
  const word = (o: "cleared" | "not_cleared" | null) => (o === "cleared" ? "cleared" : o === "not_cleared" ? "NOT cleared" : "not done yet");
  return (
    <section id="reviews" className="card scroll-mt-24 space-y-4 p-4" aria-labelledby="rev-h">
      <div>
        <h2 id="rev-h" className="text-lg font-bold">Regulatory and legal reviews for version {revision || "—"}</h2>
        <p className="text-[15px]">Regulatory: <strong>{word(state.regulatory)}</strong> · Legal: <strong>{word(state.legal)}</strong>{state.cleared ? " · both cleared, can be chosen if the score passes" : " · both must clear before this proposal can be chosen"}</p>
      </div>
      {(Object.keys(REVIEW_ITEMS) as ReviewType[]).map((t) => {
        const past = reviews.filter((r) => r.review_type === t).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return (
          <div key={t} className="space-y-2 rounded-xl border border-line p-3">
            <h3 className="font-bold">{REVIEW_TYPE_LABEL[t]}</h3>
            {past.length > 0 && (
              <ul className="space-y-1 text-sm">
                {past.map((r) => (
                  <li key={r.id} className={r.revision === revision ? "" : "text-muted"}>
                    <strong>{r.outcome === "cleared" ? "Cleared" : "Not cleared"}</strong> · version {r.revision} · {who(r.reviewer_id)} · {when(r.created_at)}
                    <span className="block whitespace-pre-line break-words">{r.note}</span>
                  </li>
                ))}
              </ul>
            )}
            {canReview && (
              <form action={saveSignatureReview} className="space-y-2">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="review_type" value={t} />
                <fieldset>
                  <legend className="label text-sm">Tick each item you checked (all are needed to clear)</legend>
                  {Object.entries(REVIEW_ITEMS[t]).map(([k, v]) => (
                    <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 py-1"><input type="checkbox" name="checklist" value={k} className="check mt-0.5" /><span className="text-[15px]">{v}</span></label>
                  ))}
                </fieldset>
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Outcome</legend>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="outcome" value="cleared" required className="check" /><span className="font-semibold">Cleared</span></label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="outcome" value="not_cleared" className="check" /><span className="font-semibold">Not cleared</span></label>
                </fieldset>
                <div className="field">
                  <label htmlFor={`rn-${t}`} className="label text-sm">What you checked, and anything missing</label>
                  <textarea id={`rn-${t}`} name="note" required minLength={5} maxLength={2000} rows={3} className="input" placeholder={t === "regulatory" ? "e.g. LTO CFRR-RIII-FM-123456 verified on the FDA portal, valid to 2027-06-30; CPR for 2 of 3 products, third to be filed." : "e.g. Formula owned by FLAME PH per the draft agreement; liability and insurance clause reviewed by counsel."} />
                </div>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save {REVIEW_TYPE_LABEL[t].toLowerCase()}</SubmitButton>
              </form>
            )}
          </div>
        );
      })}
    </section>
  );
}
