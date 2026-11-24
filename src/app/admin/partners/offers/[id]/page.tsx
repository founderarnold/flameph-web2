import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { ROLE_LABELS } from "@/lib/moderation";
import {
  BASE_UNITS, unitCount, COMMISSION_HELP, ITEM_COLS, landedCost, memberDiscount, OFFER_COLS, OFFER_FILE_TYPES, OFFER_REASON_KEYS, OFFER_REASONS, offerResult,
  OFFER_STATUS, PASS_MARK, peso, PRODUCT_GROUPS, SAMPLES, SCORE_PARTS, SHIPPING_TERMS, STOCK, VAT_BASIS, type ItemRow, type ScoreRow,
} from "@/lib/offers";
import {
  PACKAGE_COLS, REFERENCE_COLS, SERVICE_COLS, SERVICE_FILE_TYPES, SERVICE_GATE_HELP, SERVICE_REASON_KEYS, SERVICE_REASONS, SERVICE_SCORE_LABELS, SERVICE_CATEGORIES,
  type PackageRow, type ReferenceRow, type ServiceOfferRow,
} from "@/lib/service-offers";
import { trackRecords } from "@/lib/service-offers-server";
import { declareConflict, decideOffer, saveScore, teamNote } from "../actions";
import { ReferencesSection, ServiceTerms, TrackRecordCard } from "./ServiceSections";
import {
  reviewState, SIG_PRODUCT_COLS, SIGNATURE_CATEGORIES, SIGNATURE_COLS, SIGNATURE_GATE_HELP, SIGNATURE_REASON_KEYS, SIGNATURE_REASONS, SIGNATURE_SCORE_LABELS,
  SIGNATURE_FILE_TYPES, SITE_COLS, type ReviewRow, type SigProductRow, type SignatureOfferRow, type SiteRow,
} from "@/lib/signature";
import { SignatureProducts, SignatureReviews, SignatureTerms } from "./SignatureSections";

export const metadata = { title: "Partner offer", robots: { index: false } };

type Doc = { id: string; doc_type: string; item_id: string | null; file_name: string; size_bytes: number; mime: string; uploaded_at: string };
type Score = ScoreRow & { id: string; compliance_note: string | null; note: string | null; updated_at: string; price_value: number; quality_samples: number; compliance_reliability: number; commission_benefits: number; logistics_support: number };
type Conflict = { reviewer_id: string | null; has_conflict: boolean; details: string | null; declared_at: string };
type History = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number; internal: boolean; actor_id: string | null };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ERR: Record<string, string> = {
  own: "This is your own offer. Another member of the national team must review it.", status: "Only an offer waiting for review can be scored or decided.",
  coi: "Answer the conflict-of-interest question.", coi_details: "You said you have a conflict: please say what it is.", coi_locked: "You already declared a conflict for this offer.",
  coi_first: "Declare first that you have no conflict of interest. Reviewers with a conflict do not score or decide.",
  score: "Each score must be a whole number from 0 up to its maximum.", gate_choice: "Choose whether the offer passes the compliance gate.",
  gate_note: "Say why it fails the compliance gate.", decision: "Choose a decision.", reasons: "Choose at least one reason so the supplier knows what to change.",
  note: "You chose \"Other reason\": please write a note.", selection_reason: "Write the reason for the final selection.",
  gate: `A Best Offer needs the compliance gate passed by every reviewer and an average score of at least ${PASS_MARK} for this version.`,
  empty_note: "Write the note first.", failed: "That didn't go through. Please try again.", missing: "Not found.",
  ref_choice: "Choose whether the past client was verified.", ref_note: "Write what the client said, or why it could not be verified.",
  reviews: "A FLAME Signature proposal can be chosen only after the regulatory AND the legal review of this version are both cleared.",
  review: "Tick every item before marking the review cleared, or choose \"Not cleared\" and say what is missing.",
  review_outcome: "Choose Cleared or Not cleared.", review_note: "Write what you checked (at least a few words).",
  product_note: "Say why the product is not approved, so the manufacturer knows what to change.",
  regulatory_first: "Clear the regulatory review of this version before approving products.",
};
const DONE: Record<string, string> = { review: "Review saved.", product: "Product decision saved.", coi: "Declaration saved.", scored: "Score saved.", decided: "Decision saved. The partner was told in their Inbox and by email.", note: "Note saved (team only).", reference: "Result of the call saved." };
const ACTION: Record<string, string> = { submitted: "Sent by the partner", needs_changes: "Asked for changes", selected: "Chosen as Best Offer", not_selected: "Not chosen", withdrawn: "Withdrawn by the partner", reopened: "Opened again by the partner", team_note: "Team note" };

/** One supplier offer for the national team: terms, products with landed cost, files (logged viewer), conflict
 *  declaration, scoring, the decision and the history. */
export default async function OfferReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data: row }, { data: itemRows }, { data: docRows }, { data: scoreRows }, { data: coiRows }, { data: histRows }] = await Promise.all([
    ctx.db.from("supplier_offers").select(`user_id, application_id, ${OFFER_COLS}, ${SERVICE_COLS}, ${SIGNATURE_COLS}`).eq("id", id).maybeSingle(),
    ctx.db.from("supplier_offer_items").select(ITEM_COLS).eq("offer_id", id).order("position"),
    ctx.db.from("vetting_documents").select("id, doc_type, item_id, file_name, size_bytes, mime, uploaded_at").eq("offer_id", id).eq("purpose", "offer").is("deleted_at", null).order("uploaded_at"),
    ctx.db.from("supplier_offer_scores").select("id, reviewer_id, revision, total, compliance_pass, compliance_note, note, updated_at, price_value, quality_samples, compliance_reliability, commission_benefits, logistics_support").eq("offer_id", id).order("revision", { ascending: false }),
    ctx.db.from("supplier_offer_conflicts").select("reviewer_id, has_conflict, details, declared_at").eq("offer_id", id),
    ctx.db.from("supplier_offer_history").select("id, action, reasons, note, created_at, revision, internal, actor_id").eq("offer_id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (!row) notFound();
  const o = row as unknown as ServiceOfferRow & SignatureOfferRow & { user_id: string; application_id: string | null };
  const service = o.kind === "service";
  const signature = o.kind === "manufacturer";
  const [{ data: siteRows }, { data: sigRows }, { data: revRows }] = signature ? await Promise.all([
    ctx.db.from("signature_sites").select(SITE_COLS).eq("offer_id", id).order("position"),
    ctx.db.from("signature_products").select(SIG_PRODUCT_COLS).eq("offer_id", id).order("position"),
    ctx.db.from("signature_reviews").select("id, revision, review_type, outcome, checklist, note, reviewer_id, created_at").eq("offer_id", id).order("created_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const sites = (siteRows ?? []) as unknown as SiteRow[];
  const sigProducts = (sigRows ?? []) as unknown as SigProductRow[];
  const reviews = (revRows ?? []) as unknown as ReviewRow[];
  const rState = reviewState(reviews, o.revision);
  const [{ data: pkgRows }, { data: refRows }] = service ? await Promise.all([
    ctx.db.from("service_offer_packages").select(PACKAGE_COLS).eq("offer_id", id).order("position"),
    ctx.db.from("service_offer_references").select(REFERENCE_COLS).eq("offer_id", id).order("position"),
  ]) : [{ data: [] }, { data: [] }];
  const packages = (pkgRows ?? []) as unknown as PackageRow[];
  const refs = (refRows ?? []) as unknown as ReferenceRow[];
  const track = service ? (await trackRecords(ctx.db, [o.user_id], new Map([[o.user_id, refs]]))).get(o.user_id) : undefined;
  const partnerWord = service ? "service provider" : signature ? "toll manufacturer" : "supplier";
  const scoreLabel = (k: keyof typeof SERVICE_SCORE_LABELS, l: string) => (service ? SERVICE_SCORE_LABELS[k].label : signature ? SIGNATURE_SCORE_LABELS[k].label : l);
  const scoreHelp = (k: keyof typeof SERVICE_SCORE_LABELS, h: string) => (service ? SERVICE_SCORE_LABELS[k].help : signature ? SIGNATURE_SCORE_LABELS[k].help : h);
  const reasonText = (r: string) => (service ? SERVICE_REASONS[r as keyof typeof SERVICE_REASONS] : signature ? SIGNATURE_REASONS[r as keyof typeof SIGNATURE_REASONS] : undefined) ?? OFFER_REASONS[r as keyof typeof OFFER_REASONS] ?? r;
  const fileLabel = (t: string) => (service ? SERVICE_FILE_TYPES[t as keyof typeof SERVICE_FILE_TYPES]?.label : signature ? SIGNATURE_FILE_TYPES[t as keyof typeof SIGNATURE_FILE_TYPES]?.label : undefined) ?? OFFER_FILE_TYPES[t as keyof typeof OFFER_FILE_TYPES]?.label ?? t;
  const items = (itemRows ?? []) as unknown as ItemRow[];
  const docs = (docRows ?? []) as Doc[];
  const scores = (scoreRows ?? []) as Score[];
  const conflicts = (coiRows ?? []) as Conflict[];
  const history = (histRows ?? []) as History[];
  const own = o.user_id === ctx.user.id;
  const mine = conflicts.find((c) => c.reviewer_id === ctx.user.id) ?? null;
  const cleared = !!mine && !mine.has_conflict && !own;
  const current = scores.filter((s) => s.revision === o.revision);
  const myScore = current.find((s) => s.reviewer_id === ctx.user.id) ?? null;
  const res = offerResult(scores, o.revision);
  const people = [...new Set([...scores.map((s) => s.reviewer_id), ...conflicts.map((c) => c.reviewer_id), ...history.map((h) => h.actor_id), ...refs.map((r) => r.verified_by), ...reviews.map((r) => r.reviewer_id)].filter(Boolean) as string[])];
  const [{ data: prof }, { data: names }, { data: roleRows }, { data: same }] = await Promise.all([
    ctx.db.from("partner_profiles").select("legal_name, status, categories, accredited_at").eq("user_id", o.user_id).maybeSingle(),
    people.length ? ctx.db.from("profiles").select("id, full_name").in("id", people) : Promise.resolve({ data: [] }),
    people.length ? ctx.db.from("roles").select("user_id, role").in("user_id", people) : Promise.resolve({ data: [] }),
    o.product_group ? ctx.db.from("supplier_offers").select("id").eq("product_group", o.product_group).in("status", ["submitted", "selected"]).neq("id", id).limit(5)
      : o.service_category ? ctx.db.from("supplier_offers").select("id").eq("kind", "service").eq("service_category", o.service_category).in("status", ["submitted", "selected"]).neq("id", id).limit(5)
      : o.signature_category ? ctx.db.from("supplier_offers").select("id").eq("kind", "manufacturer").eq("signature_category", o.signature_category).in("status", ["submitted", "selected"]).neq("id", id).limit(5)
      : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name as string]));
  const roleOf = new Map((roleRows ?? []).map((r) => [r.user_id, ROLE_LABELS[r.role] ?? r.role]));
  const who = (uid: string | null) => (uid ? `${nameOf.get(uid) ?? "Team member"}${roleOf.get(uid) ? ` (${roleOf.get(uid)})` : ""}` : "Erased account");
  const compareHref = `/admin/partners/offers/compare?${[id, ...(same ?? []).map((s) => s.id)].map((x) => `id=${x}`).join("&")}`;
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="space-y-4">
      <PartnerTabs current={service ? "service_offers" : signature ? "signature_offers" : "offers"} />
      <header>
        <p className="text-xs font-bold uppercase text-muted">{service ? `Service offer · ${o.service_category ? SERVICE_CATEGORIES[o.service_category] : "kind not chosen"}` : signature ? `FLAME Signature proposal · ${o.signature_category ? SIGNATURE_CATEGORIES[o.signature_category] : "kind not chosen"}` : o.product_group ? PRODUCT_GROUPS[o.product_group] : "No product group"}{o.revision > 0 ? ` · version ${o.revision}` : ""}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{o.title || "(no name yet)"}</h1>
        <p className="text-sm">{service ? "Service provider" : signature ? "Toll manufacturer" : "Supplier"}: <strong>{prof?.legal_name ?? "—"}</strong> ({prof?.status === "accredited" ? "accredited" : "not accredited now"}){o.application_id && <> · <Link href={`/admin/partners/${o.application_id}`} className="underline">{partnerWord} application</Link></>}</p>
        <p className="text-sm">Status: <strong>{OFFER_STATUS[o.status].label}</strong> · sent {when(o.submitted_at)}</p>
      </header>
      {sp.done && <Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice>}
      {sp.error && <Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice>}
      {own && <Notice tone="warn">{ERR.own}</Notice>}

      {(same ?? []).length > 0 && signature && <Link href={compareHref} className="btn btn-outline min-h-11 w-full px-3 text-sm sm:w-auto">Compare with other proposals for this kind of product</Link>}
      {signature && <SignatureTerms o={o} sites={sites} />}
      {(same ?? []).length > 0 && service && <Link href={compareHref} className="btn btn-outline min-h-11 w-full px-3 text-sm sm:w-auto">Compare with other offers for this kind of service</Link>}
      {service && <><ServiceTerms o={o} packages={packages} /><TrackRecordCard tr={track} /><ReferencesSection id={id} refs={refs} canCheck={cleared && o.status !== "draft" && o.status !== "withdrawn"} who={who} /></>}
      {!service && !signature && <>
      <section className="card space-y-3 p-4" aria-labelledby="terms-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="terms-h" className="text-lg font-bold">Offer terms</h2>
          {(same ?? []).length > 0 && <Link href={compareHref} className="btn btn-outline min-h-11 px-3 text-sm">Compare with others in this group</Link>}
        </div>
        <PartnerMoneyNotice compact />
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item k="Proposed commission" v={o.commission_pct !== null ? <>{Number(o.commission_pct)}% of net sales<span className="block text-xs text-muted">{COMMISSION_HELP}</span></> : null} />
          <Item k="Other benefits for members or chapters" v={o.commission_note} />
          <Item k="Prices valid until" v={day(o.valid_until)} /><Item k="VAT" v={o.vat_basis ? VAT_BASIS[o.vat_basis] : null} />
          <Item k="Areas served" v={o.serviceable_areas} />
          <Item k="Delivery" v={o.shipping_terms ? `${SHIPPING_TERMS[o.shipping_terms]}${o.shipping_note ? `. ${o.shipping_note}` : ""}` : null} />
          <Item k="Days from order to delivery" v={o.lead_time_days !== null ? `${o.lead_time_days} days` : null} />
          <Item k="Warranty" v={o.warranty} /><Item k="Returns and replacements" v={o.returns_policy} />
          <Item k="Samples" v={o.sample_availability ? `${SAMPLES[o.sample_availability]}${o.sample_terms ? `. ${o.sample_terms}` : ""}` : null} />
          <Item k="Certifications" v={o.certifications} />
        </dl>
      </section>

      <section className="card p-4" aria-labelledby="prod-h">
        <h2 id="prod-h" className="text-lg font-bold">Products ({items.length})</h2>
        <ul className="mt-2 divide-y divide-line">
          {items.map((it) => {
            const lc = landedCost(it, o.vat_basis); const d = memberDiscount(it);
            return (
              <li key={it.id} className="space-y-0.5 py-3 text-[15px]">
                <p className="break-words font-bold">{it.product_name}{it.brand ? <span className="font-normal text-muted"> · {it.brand}</span> : null}{it.sku ? <span className="font-normal text-muted"> · SKU {it.sku}</span> : null}</p>
                {it.description && <p className="whitespace-pre-line text-sm text-muted">{it.description}</p>}
                <p className="text-sm">Sold by {it.sell_unit} ({unitCount(it.base_qty, it.base_unit)}) · regular {peso(it.regular_price)} · wholesale {peso(it.wholesale_price)} · member <strong>{peso(it.member_price)}</strong>{d !== null ? ` (${d}% off)` : ""}</p>
                <p className="text-sm">Landed: {peso(lc.perSellUnit)} per selling unit = <strong>{peso(lc.perBaseUnit)} per {BASE_UNITS[it.base_unit].label}</strong> (delivery {peso(it.shipping_per_unit)} per unit)</p>
                <p className="text-sm text-muted">MOQ {it.moq} · capacity {it.monthly_capacity ?? "—"}/month · {STOCK[it.stock_status]}{it.lead_time_days !== null ? ` · ${it.lead_time_days} days` : ""}{it.tiers.length ? ` · bulk: ${it.tiers.map((t) => `${t.min_qty}+ at ${peso(t.price)}`).join(", ")}` : ""}</p>
              </li>
            );
          })}
        </ul>
      </section>
      </>}

      <section id="files" className="card scroll-mt-24 p-4" aria-labelledby="files-h">
        <h2 id="files-h" className="text-lg font-bold">Photos and files ({docs.length})</h2>
        <p className="text-sm text-muted">Encrypted. Each opening is logged.</p>
        {docs.length === 0 ? <p className="mt-2 text-sm text-muted">No files.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {docs.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0"><span className="block font-semibold">{fileLabel(x.doc_type)}{x.item_id ? <span className="font-normal text-muted"> · {items.find((i) => i.id === x.item_id)?.product_name}</span> : null}</span>
                  <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                {!own && <a href={`/api/vetting/doc/${x.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline min-h-11 px-3 text-sm">Open</a>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {signature && <SignatureProducts id={id} o={o} products={sigProducts} sites={sites} canDecide={cleared && (o.status === "submitted" || o.status === "selected")} regulatoryCleared={rState.regulatory === "cleared"} />}

      {!own && (
        <section id="coi" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="coi-h">
          <h2 id="coi-h" className="text-lg font-bold">Conflict of interest</h2>
          {mine?.has_conflict ? (
            <Notice tone="warn">You declared a conflict ({mine.details}). You do not score or decide on this offer.</Notice>
          ) : mine ? (
            <>
              <p className="text-[15px]">You declared <strong>no conflict of interest</strong> on {when(mine.declared_at)}.</p>
              <details className="rounded-xl border border-line px-3 py-1">
                <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">I now have a conflict…</summary>
                <form action={declareConflict} className="space-y-2 pb-3">
                  <input type="hidden" name="id" value={id} /><input type="hidden" name="conflict" value="yes" />
                  <label htmlFor="details-late" className="label text-sm">What is the conflict?</label>
                  <textarea id="details-late" name="details" required maxLength={1000} rows={2} className="input" placeholder="e.g. I am related to the owner; I own shares in a competing supplier." />
                  <p className="text-xs text-muted">Your score for this offer will be removed and you will step aside.</p>
                  <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Declare conflict and step aside</SubmitButton>
                </form>
              </details>
            </>
          ) : (
            <form action={declareConflict} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <p className="text-[15px]">Before you score, decide{service ? " or call past clients" : ""}: do you, your family or your own business have any interest in this {partnerWord} or a competing one?</p>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Conflict of interest</legend>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="conflict" value="no" required className="check" /><span className="font-semibold">No conflict of interest</span></label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="conflict" value="yes" className="check" /><span className="font-semibold">I have a conflict (I step aside)</span></label>
              </fieldset>
              <div className="field">
                <label htmlFor="details" className="label text-sm">If you have a conflict, what is it?</label>
                <textarea id="details" name="details" maxLength={1000} rows={2} className="input" />
              </div>
              <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save my declaration</SubmitButton>
            </form>
          )}
        </section>
      )}

      {cleared && o.status === "submitted" && (
        <section id="score" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="score-h">
          <h2 id="score-h" className="text-lg font-bold">Your score for version {o.revision}</h2>
          <form action={saveScore} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-3 sm:grid-cols-2">
              {SCORE_PARTS.map((p) => (
                <div key={p.key} className="field">
                  <label htmlFor={p.key} className="label">{scoreLabel(p.key, p.label)} <span className="text-sm font-normal text-muted">(0 to {p.max})</span></label>
                  <input id={p.key} name={p.key} type="number" min={0} max={p.max} step={1} required inputMode="numeric" defaultValue={myScore?.[p.key] ?? ""} className="input" aria-describedby={`${p.key}-help`} />
                  <p id={`${p.key}-help`} className="field-help">{scoreHelp(p.key, p.help)}</p>
                </div>
              ))}
            </div>
            <fieldset className="space-y-2 rounded-xl border-2 border-line p-3">
              <legend className="px-1 font-bold">Compliance gate (required)</legend>
              <p className="text-sm text-muted">{service ? SERVICE_GATE_HELP : signature ? SIGNATURE_GATE_HELP : "Pass only if the supplier is accredited, its permits are current, and products that need FDA registration or certificates have them."}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="compliance" value="pass" required defaultChecked={myScore?.compliance_pass === true} className="check" /><span className="font-semibold">Passes</span></label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="compliance" value="fail" defaultChecked={myScore?.compliance_pass === false} className="check" /><span className="font-semibold">Fails</span></label>
              </div>
              <label htmlFor="compliance_note" className="label text-sm">Compliance note (needed if it fails)</label>
              <textarea id="compliance_note" name="compliance_note" maxLength={1000} rows={2} defaultValue={myScore?.compliance_note ?? ""} className="input" />
            </fieldset>
            <div className="field">
              <label htmlFor="snote" className="label">Notes for the team (optional)</label>
              <textarea id="snote" name="note" maxLength={2000} rows={2} defaultValue={myScore?.note ?? ""} className="input" />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">{myScore ? "Update my score" : "Save my score"}</SubmitButton>
          </form>
        </section>
      )}

      {signature && <SignatureReviews id={id} revision={o.revision} reviews={reviews} canReview={cleared && o.status === "submitted"} who={who} />}

      <section className="card space-y-3 p-4" aria-labelledby="result-h">
        <h2 id="result-h" className="text-lg font-bold">Scores for version {o.revision || "—"}</h2>
        <p className="text-[15px]">Average: <strong>{res.average ?? "not scored"}</strong> / 100 (pass mark {PASS_MARK}) · compliance gate: <strong>{res.compliance === "pass" ? "passed" : res.compliance === "fail" ? "failed" : "not checked"}</strong>{res.canSelect ? " · can be chosen as a Best Offer" : ""}</p>
        {current.length > 0 && (
          <ul className="divide-y divide-line text-sm">
            {current.map((s) => (
              <li key={s.id} className="py-2">
                <p><strong>{who(s.reviewer_id)}</strong>: {s.total}/100 · {s.compliance_pass ? "compliance passed" : `compliance FAILED: ${s.compliance_note}`}</p>
                <p className="text-muted">{SCORE_PARTS.map((p) => `${scoreLabel(p.key, p.label)} ${s[p.key]}/${p.max}`).join(" · ")}</p>
                {s.note && <p className="whitespace-pre-line">{s.note}</p>}
              </li>
            ))}
          </ul>
        )}
        {conflicts.filter((c) => c.has_conflict).map((c) => <p key={c.reviewer_id ?? c.declared_at} className="text-sm text-warn">{who(c.reviewer_id)} declared a conflict and stepped aside: {c.details}</p>)}
        {scores.some((s) => s.revision !== o.revision) && <p className="text-xs text-muted">Scores for earlier versions are kept in the record but do not count for this version.</p>}
      </section>

      {cleared && o.status === "submitted" && (
        <section id="decide" className="card scroll-mt-24 space-y-3 border-2 border-primary p-4" aria-labelledby="dec-h">
          <h2 id="dec-h" className="text-lg font-bold">Decision</h2>
          {!res.canSelect && <Notice tone="info">{ERR.gate}</Notice>}
          {signature && !rState.cleared && <Notice tone="info">{ERR.reviews}</Notice>}
          <form action={decideOffer} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <fieldset className="grid gap-2 sm:grid-cols-3">
              <legend className="label">What do you decide?</legend>
              {([["selected", "Choose as Best Offer"], ["needs_changes", "Send back for changes"], ["not_selected", "Not chosen"]] as const).map(([v, l]) => (
                <label key={v} className={`flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft ${v === "selected" && (!res.canSelect || (signature && !rState.cleared)) ? "opacity-50" : "cursor-pointer"}`}>
                  <input type="radio" name="decision" value={v} required disabled={v === "selected" && (!res.canSelect || (signature && !rState.cleared))} className="check" /><span className="font-semibold">{l}</span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor="selection_reason" className="label">Reason for the final selection (needed to choose)</label>
              <textarea id="selection_reason" name="selection_reason" rows={3} maxLength={2000} className="input" placeholder={signature ? "e.g. Lowest toll price per 100 g among 3 sauce makers, current FDA LTO, sample batches scored 4.5/5, both reviews cleared." : service ? "e.g. Lowest monthly member rate among 3 bookkeepers, CPA-led, 2 past clients verified, replies within 24 hours." : "e.g. Lowest landed cost per piece among 3 offers, delivers to all 3 pilot regions, compliance passed."} />
            </div>
            <fieldset>
              <legend className="label">Reasons the {partnerWord} will see (needed for changes or not chosen)</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {(service ? SERVICE_REASON_KEYS : signature ? SIGNATURE_REASON_KEYS : OFFER_REASON_KEYS).map((k) => (
                  <label key={k} className="flex min-h-11 cursor-pointer items-start gap-2 py-1"><input type="checkbox" name="reasons" value={k} className="check mt-0.5" /><span className="text-[15px]">{reasonText(k)}</span></label>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="note" className="label">Note to the {partnerWord} (optional; needed with &quot;Other reason&quot;)</label>
              <textarea id="note" name="note" rows={3} maxLength={2000} className="input" />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save decision</SubmitButton>
          </form>
        </section>
      )}
      {o.status === "selected" && o.selection_reason && <Notice tone="ok">Chosen as a Best Offer on {when(o.decided_at)}: {o.selection_reason}</Notice>}

      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        {history.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
          <ol className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{ACTION[h.action] ?? h.action}</span>{h.internal && <span className="ml-1 rounded bg-bg-soft px-1 text-xs">team only</span>}
                <span className="text-muted"> · {when(h.created_at)}{h.revision > 0 ? ` · version ${h.revision}` : ""}{h.actor_id && h.actor_id !== o.user_id ? ` · ${who(h.actor_id)}` : ""}</span>
                {h.reasons.length > 0 && <span className="block text-muted">{h.reasons.map(reasonText).join("; ")}</span>}
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        )}
        {!own && (
          <form action={teamNote} className="space-y-2 border-t border-line pt-3">
            <input type="hidden" name="id" value={id} />
            <label htmlFor="tnote" className="label text-sm">Add a note for the national team (the {partnerWord} never sees it)</label>
            <textarea id="tnote" name="note" required maxLength={2000} rows={2} className="input" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save note</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
