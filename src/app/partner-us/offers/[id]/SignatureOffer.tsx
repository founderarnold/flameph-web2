import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ShrinkPhotoInput } from "@/components/ShrinkPhotoInput";
import { PlacePicker } from "@/components/PlacePicker";
import { Select, Text, TextArea } from "@/components/PartnerFields";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { SigProductSummary } from "@/components/SignatureProductSummary";
import { PARTNER_DOC_MAX_BYTES, PHOTO_MAX_SIDE } from "@/lib/partner";
import { COMMISSION_HELP, MAX_OFFER_FILES, OFFER_DONE, OFFER_EDITABLE, OFFER_ERRORS, OFFER_LAST_STEP, OFFER_REASONS, OFFER_STATUS, SAMPLES, VAT_BASIS, type OfferStatus } from "@/lib/offers";
import {
  CPR_HOLDER, CPR_STATUS, FORMULA_OWNERSHIP, IP_TERMS, IP_TERMS_VERSION, MAX_SIG_PRODUCTS, MAX_SITES, PACKAGING_SUPPLY, PRICE_INCLUDES, PRODUCT_TYPES,
  SIG_PRODUCT_COLS, SIGNATURE_CATEGORIES, SIGNATURE_DECLARATION, SIGNATURE_ERRORS, SIGNATURE_FILE_KEYS, SIGNATURE_FILE_TYPES, SIGNATURE_REASONS, SIGNATURE_STEPS,
  signatureMissing, SITE_COLS, type SignatureOfferRow, type SigProductRow, type SiteRow,
} from "@/lib/signature";
import { deleteDraftOffer, deleteOfferFile, reopenOffer, submitOffer, uploadOfferFile, withdrawOffer } from "../actions";
import { deleteSigProduct, deleteSite, saveSignatureStep, saveSigProduct, saveSite } from "../signature-actions";

type Doc = { id: string; doc_type: string; item_id: string | null; file_name: string; size_bytes: number; uploaded_at: string };
type History = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number };
type SP = { step?: string; site?: string; prod?: string; done?: string; error?: string };

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const tone = (s: OfferStatus) => ({ ok: "ok", warn: "warn", danger: "danger", info: "info" } as const)[OFFER_STATUS[s].tone];
const ACTION: Record<string, string> = { submitted: "Sent", needs_changes: "Review team asked for changes", selected: "Chosen as a FLAME Signature partner", not_selected: "Not chosen this time", withdrawn: "Withdrawn", reopened: "Opened again for changes" };
const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const yn = (b: boolean | null | undefined) => (b === true ? "yes" : b === false ? "no" : null);
const reasonText = (r: string) => SIGNATURE_REASONS[r as keyof typeof SIGNATURE_REASONS] ?? OFFER_REASONS[r as keyof typeof OFFER_REASONS] ?? r;
const DONE: Record<string, string> = {
  ...OFFER_DONE,
  started: "Your FLAME Signature proposal is started. Fill in each screen; it saves as you go.",
  site_saved: "Site saved.", site_deleted: "Site removed.", product_saved: "Product saved.", product_deleted: "Product removed.",
};

function SaveButtons({ step }: { step: number }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
      <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
      {step < OFFER_LAST_STEP && <button type="submit" name="intent" value="next" className="btn btn-primary min-h-11 w-full sm:w-auto">Save and continue →</button>}
    </div>
  );
}

/** The toll manufacturer's FLAME Signature proposal (Step 7): five screens, the same flow and buttons as the supplier form. */
export async function SignatureOffer({ o, docs, history, sp }: { o: SignatureOfferRow; docs: Doc[]; history: History[]; sp: SP }) {
  const { supabase } = await requireUser(`/partner-us/offers/${o.id}`);
  const [{ data: siteRows }, { data: prodRows }] = await Promise.all([
    supabase.from("signature_sites").select(SITE_COLS).eq("offer_id", o.id).order("position"),
    supabase.from("signature_products").select(SIG_PRODUCT_COLS).eq("offer_id", o.id).order("position"),
  ]);
  const sites = (siteRows ?? []) as unknown as SiteRow[];
  const products = (prodRows ?? []) as unknown as SigProductRow[];
  const editable = OFFER_EDITABLE.includes(o.status);
  const step = editable ? Math.min(OFFER_LAST_STEP, Math.max(1, Number(sp.step) || 1)) : OFFER_LAST_STEP;
  const missing = signatureMissing(o, sites, products);
  const err = sp.error ? SIGNATURE_ERRORS[sp.error] ?? OFFER_ERRORS[sp.error] ?? OFFER_ERRORS.failed : null;
  const done = sp.done ? DONE[sp.done] : null;
  const editSite = step === 2 && editable ? (sp.site === "new" ? "new" : sites.find((x) => x.id === sp.site) ?? null) : null;
  const es = editSite && editSite !== "new" ? editSite : null;
  const editProd = step === 3 && editable ? (sp.prod === "new" ? "new" : products.find((x) => x.id === sp.prod) ?? null) : null;
  const ep = editProd && editProd !== "new" ? editProd : null;
  const base = `/partner-us/offers/${o.id}`;
  const stepInfo = SIGNATURE_STEPS[step - 1];
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.site_name ?? null;
  const approved = products.filter((p) => p.approval === "approved").length;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › <Link href="/partner-us/offers" className="underline">My Best Offers</Link>
      </nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">FLAME Signature na alok ng toll manufacturer</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{o.title || "New FLAME Signature proposal"}</h1>
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
          <h2 id="sel-h" className="text-lg font-bold text-ok">Your proposal was chosen for FLAME Signature</h2>
          {o.selection_reason && <p className="whitespace-pre-line text-[15px]">{o.selection_reason}</p>}
          <p className="text-sm text-muted">{approved} of {products.length} product(s) approved so far. You may use the FLAME Signature mark only after the national team issues a licence for the approved products and territories, and only on batches it releases. See <Link href="/partner-us/signature" className="underline">My FLAME Signature</Link>. The agreement with MarketplacePH Online Store comes later, in writing, after legal review.</p>
        </section>
      )}
      {["not_selected", "withdrawn", "selected"].includes(o.status) && (
        <form action={reopenOffer} className="card space-y-2 p-4"><input type="hidden" name="id" value={o.id} />
          <p className="text-[15px]">{o.status === "selected" ? "Need to change products, prices or sites? Opening it for changes stops it being chosen and SUSPENDS any FLAME Signature licence at once, until the national team reviews the new version (including the regulatory and legal reviews)." : "You can change the proposal and send it again as a new version."}</p>
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Opening…">{o.status === "selected" ? "Change this proposal" : "Change and send again"}</SubmitButton>
        </form>
      )}

      {editable && (
        <nav aria-label="Proposal steps" className="card p-3">
          <p className="px-1 text-sm font-semibold sm:hidden">Step {step} of {OFFER_LAST_STEP}: {stepInfo.title}</p>
          <div className="mx-1 mt-2 h-2 overflow-hidden rounded-full bg-bg-soft sm:hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${(step / OFFER_LAST_STEP) * 100}%` }} /></div>
          <ol className="mt-2 flex gap-1 overflow-x-auto sm:mt-0 sm:grid sm:grid-cols-5">
            {SIGNATURE_STEPS.map((s) => (
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

      {editable && step === 1 && (
        <form action={saveSignatureStep} className="card space-y-4 p-4 sm:p-6">
          <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={1} />
          <div>
            <h2 className="text-xl font-extrabold">{stepInfo.title}</h2>
            <p className="text-sm text-muted" lang="fil">{stepInfo.fil}. Puwedeng i-save at ituloy mamaya.</p>
          </div>
          <Text name="title" label="Name of the proposal" value={o.title} need max={150} placeholder="e.g. FLAME Signature sauces and condiments" help="A short name for this group of products." />
          <Select name="signature_category" label="Kind of products" value={o.signature_category} need options={Object.entries(SIGNATURE_CATEGORIES)} help="Proposals of the same kind are compared with each other." />
          <fieldset className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
            <legend className="px-1 font-bold">Formula (recipe)<span className="ml-1 text-xs font-normal text-muted">(needed to send)</span></legend>
            {Object.entries(FORMULA_OWNERSHIP).map(([k, v]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="formulation_ownership" value={k} defaultChecked={o.formulation_ownership === k} className="check mt-1" />
                <span><span className="block font-semibold">{v.label}</span><span className="block text-sm text-muted">{v.help}</span></span>
              </label>
            ))}
            <TextArea name="formulation_note" label="Note about the formula (optional)" value={o.formulation_note} max={1000} rows={2} placeholder="e.g. Our banana ketchup formula since 2015; FLAME PH may ask for a sweeter version" help="Do not write the secret formula itself here." />
            <Select name="rnd_support" label="Can you develop or adjust a formula for FLAME PH?" value={yn(o.rnd_support)} need options={[["yes", "Yes"], ["no", "No"]]} />
          </fieldset>
          <Text name="valid_until" label="Prices valid until" value={o.valid_until} need type="date" max={10} help="Hanggang kailan ninyo kayang ibigay ang presyong ito?" />
          <Select name="vat_basis" label="VAT" value={o.vat_basis} need options={Object.entries(VAT_BASIS)} help="So prices are compared fairly, we add 12% VAT to prices typed without it." />
          <TextArea name="serviceable_areas" label="Where you deliver finished goods" value={o.serviceable_areas} need max={1000} rows={2} placeholder="e.g. Luzon by our own trucks; Visayas and Mindanao by sea freight" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="lead_time_days" label="Days from purchase order to delivery" value={num(o.lead_time_days)} need max={3} inputMode="numeric" placeholder="e.g. 21" help="For a normal production batch." />
            <Select name="packaging_supply" label="Who supplies packaging and labels" value={o.packaging_supply} need options={Object.entries(PACKAGING_SUPPLY)} />
          </div>
          <SaveButtons step={1} />
        </form>
      )}

      {editable && step === 2 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="site-h">
          <div>
            <h2 id="site-h" className="text-xl font-extrabold">Manufacturing sites</h2>
            <p className="text-sm text-muted" lang="fil">Ilagay ang bawat planta kung saan gagawin ang produkto, at ang FDA License to Operate nito. Hanggang {MAX_SITES} planta.</p>
          </div>
          <Notice tone="info">The national team checks each site against your manufacturing rights (the area where you may make FLAME Signature products). Products that need FDA can only be made at a site with a current FDA License to Operate.</Notice>
          {sites.length === 0 && !editSite && <Notice tone="info">No sites yet. Add your first site below.</Notice>}
          {sites.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {sites.map((s) => (
                <li key={s.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <span className="min-w-0">
                    <span className="block break-words font-bold">{s.site_name}{s.site_type === "contract" ? <span className="font-normal text-muted"> · contract plant of {s.operator_name}</span> : null}</span>
                    <span className="block break-words text-sm">{s.address}, {s.place_label}</span>
                    <span className="block text-sm text-muted">{s.lto_no ? `FDA LTO ${s.lto_no}, valid until ${day(s.lto_valid_until)}` : "No FDA License to Operate given"} · capacity {s.monthly_capacity} a month</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <Link href={`${base}?step=2&site=${s.id}#site-form`} className="btn btn-outline min-h-11 px-3 text-sm">Edit</Link>
                    <form action={deleteSite}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="site_id" value={s.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {editSite ? (
            <form id="site-form" action={saveSite} className="scroll-mt-24 space-y-4 rounded-xl border-2 border-primary p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} />{es && <input type="hidden" name="site_id" value={es.id} />}
              <h3 className="text-lg font-extrabold">{es ? `Edit: ${es.site_name}` : "Add a manufacturing site"}</h3>
              <Text name="site_name" label="Name of the site" value={es?.site_name} need max={150} placeholder="e.g. Main plant, San Fernando" />
              <fieldset className="space-y-2">
                <legend className="label">Whose plant is it?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="site_type" value="own" defaultChecked={(es?.site_type ?? "own") === "own"} className="check" /><span className="font-semibold">Our own plant</span></label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="site_type" value="contract" defaultChecked={es?.site_type === "contract"} className="check" /><span className="font-semibold">Another company&apos;s plant</span></label>
                </div>
                <Text name="operator_name" label="Company that runs the plant (if not yours)" value={es?.operator_name} max={150} />
              </fieldset>
              <TextArea name="address" label="Street address" value={es?.address} need max={300} rows={2} placeholder="e.g. Lot 5, Jose Abad Santos Ave, Brgy. Dolores" />
              <PlacePicker defaultCode={es?.city_code ?? ""} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Text name="lto_no" label="FDA License to Operate number" value={es?.lto_no} max={60} placeholder="e.g. CFRR-III-FM-123456" help="Needed for food, drinks, supplements, cosmetics and household cleaning products." />
                <Text name="lto_valid_until" label="LTO valid until" value={es?.lto_valid_until} type="date" max={10} />
              </div>
              <Text name="certifications" label="Certifications of this plant (optional)" value={es?.certifications} max={300} placeholder="e.g. GMP, HACCP, Halal" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Text name="monthly_capacity" label="Capacity per month" value={es?.monthly_capacity} need max={200} placeholder="e.g. 40,000 bottles of 250 ml" />
                <Text name="production_lines" label="Production lines (optional)" value={es?.production_lines} max={500} placeholder="e.g. 2 filling lines, 1 retort" />
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
                <Link href={`${base}?step=2`} className="btn btn-outline min-h-11 w-full sm:w-auto">Cancel</Link>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save site</SubmitButton>
              </div>
            </form>
          ) : sites.length < MAX_SITES ? (
            <Link href={`${base}?step=2&site=new#site-form`} className="btn btn-flame min-h-11 w-full sm:w-auto">+ Add a site</Link>
          ) : <Notice tone="info">{SIGNATURE_ERRORS.site_limit}</Notice>}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`${base}?step=1`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`${base}?step=3`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {editable && step === 3 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="prod-h">
          <div>
            <h2 id="prod-h" className="text-xl font-extrabold">Products</h2>
            <p className="text-sm text-muted" lang="fil">Ilagay ang bawat produktong gagawin para sa FLAME Signature, ang presyo kada piraso, at kung saang planta ito gagawin. Hanggang {MAX_SIG_PRODUCTS} produkto.</p>
          </div>
          {sites.length === 0 && <Notice tone="warn">Add a manufacturing site first (screen 2), so you can say where each product is made.</Notice>}
          {products.length === 0 && !editProd && <Notice tone="info">No products yet.</Notice>}
          {products.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {products.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <SigProductSummary p={p} vat={o.vat_basis} site={siteName(p.site_id)} />
                  <span className="flex shrink-0 gap-2">
                    <Link href={`${base}?step=3&prod=${p.id}#prod-form`} className="btn btn-outline min-h-11 px-3 text-sm">Edit</Link>
                    <form action={deleteSigProduct}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="product_id" value={p.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {editProd ? (
            <form id="prod-form" action={saveSigProduct} className="scroll-mt-24 space-y-4 rounded-xl border-2 border-primary p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} />{ep && <input type="hidden" name="product_id" value={ep.id} />}
              <h3 className="text-lg font-extrabold">{ep ? `Edit: ${ep.product_name}` : "Add a product"}</h3>
              {ep && ep.approval !== "pending" && <Notice tone="info">Changing this product sends it back to the national team for approval.</Notice>}
              <fieldset className="space-y-4">
                <legend className="font-bold">The product</legend>
                <Text name="product_name" label="Product name" value={ep?.product_name} need max={150} placeholder="e.g. FLAME Signature Banana Ketchup 320 g" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select name="product_type" label="Type of product" value={ep?.product_type} need options={Object.entries(PRODUCT_TYPES)} />
                  <Text name="net_content" label="Net content" value={ep?.net_content} need max={60} placeholder="e.g. 320 g, 1 L" help="Write grams (g), kilos (kg), ml or L so prices compare fairly." />
                </div>
                <TextArea name="description" label="Short description (optional)" value={ep?.description} max={1000} rows={2} />
                <TextArea name="packaging" label="Packaging" value={ep?.packaging} need max={500} rows={2} placeholder="e.g. Glass bottle, metal cap, shrink band; carton of 24" help="Inner pack and outer carton." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="shelf_life_months" label="Shelf life (months)" value={ep ? num(ep.shelf_life_months) : ""} need max={3} inputMode="numeric" placeholder="12" />
                  <Text name="storage" label="Storage (optional)" value={ep?.storage} max={200} placeholder="e.g. Cool, dry place" />
                </div>
                <Select name="site_id" label="Where it is made" value={ep?.site_id ?? (sites.length === 1 ? sites[0].id : null)} need options={sites.map((s) => [s.id, `${s.site_name} (${s.place_label})`])} />
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">FDA</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select name="fda_needed" label="Does this product need FDA registration?" value={yn(ep?.fda_needed)} need options={[["yes", "Yes"], ["no", "No"]]} help="Food, drinks, supplements, cosmetics and household cleaning products usually do." />
                  <Select name="cpr_status" label="FDA registration status" value={ep?.cpr_status} need options={Object.entries(CPR_STATUS)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="cpr_no" label="Registration number (if registered)" value={ep?.cpr_no} max={60} placeholder="e.g. FR-4000001234567" />
                  <Select name="cpr_holder" label="Whose name is (or will be) on the registration" value={ep?.cpr_holder} options={Object.entries(CPR_HOLDER)} />
                </div>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">Quantities and price (₱)</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Text name="batch_size" label="Units per batch" value={ep ? num(ep.batch_size) : ""} need max={8} inputMode="numeric" placeholder="5000" />
                  <Text name="moq" label="Smallest order (units)" value={ep ? num(ep.moq) : ""} need max={8} inputMode="numeric" placeholder="2400" help="MOQ" />
                  <Text name="sample_qty" label="Units in a sample batch (optional)" value={ep ? num(ep.sample_qty) : ""} max={6} inputMode="numeric" placeholder="24" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Text name="toll_price" label="Toll price per unit" value={ep ? num(ep.toll_price) : ""} need max={12} inputMode="decimal" placeholder="28.50" help="What you charge per unit." />
                  <Text name="suggested_srp" label="Suggested retail price (optional)" value={ep ? num(ep.suggested_srp) : ""} max={12} inputMode="decimal" placeholder="49" />
                  <Text name="lead_time_days" label="Days to produce (optional)" value={ep ? num(ep.lead_time_days) : ""} max={3} inputMode="numeric" placeholder="21" />
                </div>
                <Select name="price_includes" label="The toll price includes" value={ep?.price_includes ?? "formula_and_packaging"} need options={Object.entries(PRICE_INCLUDES)} />
              </fieldset>
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
                <Link href={`${base}?step=3`} className="btn btn-outline min-h-11 w-full sm:w-auto">Cancel</Link>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save product</SubmitButton>
              </div>
            </form>
          ) : products.length < MAX_SIG_PRODUCTS ? (
            sites.length > 0 && <Link href={`${base}?step=3&prod=new#prod-form`} className="btn btn-flame min-h-11 w-full sm:w-auto">+ Add a product</Link>
          ) : <Notice tone="info">{SIGNATURE_ERRORS.product_limit}</Notice>}
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`${base}?step=2`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`${base}?step=4`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {editable && step === 4 && (
        <section className="card space-y-5 p-4 sm:p-6" aria-labelledby="qa-h">
          <div>
            <h2 id="qa-h" className="text-xl font-extrabold">Quality, recall and files</h2>
            <p className="text-sm text-muted" lang="fil">Paano ninyo sinusuri ang bawat batch, paano natutunton ang mga sangkap, at ano ang plano kung kailangang i-recall.</p>
          </div>
          <form action={saveSignatureStep} className="space-y-4">
            <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={4} />
            <fieldset className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <legend className="px-1 font-bold">Sample batches</legend>
              <Select name="sample_availability" label="Sample batches for testing" value={o.sample_availability} need options={Object.entries(SAMPLES)} help="Chapter testers and the national team test sample batches before anything is chosen." />
              <Text name="sample_terms" label="Sample batch details (optional)" value={o.sample_terms} max={500} placeholder="e.g. One sample batch of up to 24 units per product, free" />
            </fieldset>
            <fieldset className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <legend className="px-1 font-bold">Testing</legend>
              <TextArea name="qc_testing" label="How you test each batch" value={o.qc_testing} need max={1500} rows={3} placeholder="e.g. In-house QC on every batch (pH, Brix, net content); microbiology by an accredited lab every 3rd batch" />
              <Text name="lab_partner" label="Outside laboratory you use (optional)" value={o.lab_partner} max={200} placeholder="e.g. DOST Regional Standards and Testing Lab" />
              <Text name="certifications" label="Certifications (optional)" value={o.certifications} max={500} placeholder="e.g. GMP, HACCP, Halal, ISO 22000" />
            </fieldset>
            <fieldset className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <legend className="px-1 font-bold">Batch records and traceability</legend>
              <TextArea name="traceability" label="How you trace each batch" value={o.traceability} need max={1000} rows={3} placeholder="e.g. Lot code = plant + date + line; raw material lots logged per batch in our system" help="Lot coding, and how a batch is traced back to its ingredients and packaging." />
              <Text name="batch_record_years" label="Years you keep batch records" value={num(o.batch_record_years)} need max={2} inputMode="numeric" placeholder="3" />
            </fieldset>
            <fieldset className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <legend className="px-1 font-bold">Recall readiness</legend>
              <TextArea name="recall_plan" label="Your recall plan" value={o.recall_plan} need max={1500} rows={3} placeholder="e.g. Written recall plan; recall team of 4; FDA told within 24 hours; stock pulled from distributors within 72 hours" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Text name="recall_contact" label="Recall contact person and number" value={o.recall_contact} need max={200} placeholder="e.g. QA Manager, 0917 555 0100" />
                <Text name="mock_recall_on" label="Last recall drill (optional)" value={o.mock_recall_on} type="date" max={10} />
              </div>
            </fieldset>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
          </form>

          <div className="space-y-3">
            <h3 className="font-bold">Files ({docs.length} of {MAX_OFFER_FILES})</h3>
            {docs.length < MAX_OFFER_FILES ? (
              <form action={uploadOfferFile} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
                <input type="hidden" name="id" value={o.id} />
                <div className="field">
                  <label htmlFor="doc_type" className="label">What kind of file is this?</label>
                  <select id="doc_type" name="doc_type" required className="input" defaultValue="">
                    <option value="">Choose…</option>
                    {SIGNATURE_FILE_KEYS.map((k) => <option key={k} value={k}>{SIGNATURE_FILE_TYPES[k].label}</option>)}
                  </select>
                  <p className="field-help">{SIGNATURE_FILE_KEYS.map((k) => `${SIGNATURE_FILE_TYPES[k].label}: ${SIGNATURE_FILE_TYPES[k].help}`).join(" ")}</p>
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
                    <span className="min-w-0"><span className="block font-semibold">{SIGNATURE_FILE_TYPES[x.doc_type as keyof typeof SIGNATURE_FILE_TYPES]?.label ?? x.doc_type}</span>
                      <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                    <form action={deleteOfferFile}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="doc_id" value={x.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Deleting…">Delete</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted">Files are encrypted and only the national review team can open them. Never upload a secret formula; a specification or summary is enough.</p>
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
            <h2 id="send-h" className="text-xl font-extrabold">{editable ? "Licence terms and send" : "Your proposal"}</h2>
            {editable && <p className="text-sm text-muted" lang="fil">Basahin ang kondisyon ng FLAME Signature na lisensya, ilagay ang mungkahing commission, at ipadala.</p>}
          </div>
          <PartnerMoneyNotice />
          {editable ? (
            <form action={saveSignatureStep} className="space-y-4 rounded-xl border border-line p-3 sm:p-4">
              <input type="hidden" name="offer_id" value={o.id} /><input type="hidden" name="step" value={OFFER_LAST_STEP} /><input type="hidden" name="ip_terms_shown" value="yes" />
              <fieldset className="space-y-2">
                <legend className="font-bold">FLAME Signature trademark licence terms ({IP_TERMS_VERSION})<span className="ml-1 text-xs font-normal text-muted">(needed to send)</span></legend>
                <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-6">{IP_TERMS.en.map((t) => <li key={t}>{t}</li>)}</ol>
                <p className="text-sm text-muted" lang="fil">{IP_TERMS.tl}</p>
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="ip_terms" value="yes" defaultChecked={!!o.ip_terms_accepted_at} className="check mt-0.5" /><span className="font-semibold">I accept these licence terms for my business.</span></label>
                {o.ip_terms_accepted_at && <p className="text-xs text-muted">Accepted {when(o.ip_terms_accepted_at)} ({o.ip_terms_version}).</p>}
              </fieldset>
              <Text name="commission_pct" label="Proposed commission (% of net sales)" value={num(o.commission_pct)} need max={6} inputMode="decimal" placeholder="e.g. 8" help={`${COMMISSION_HELP} The program's starting target for toll manufacturing is 8%; yours may differ.`} />
              <TextArea name="commission_note" label="Other benefits for members or chapters (optional)" value={o.commission_note} max={500} rows={2} placeholder="e.g. Free plant tour and food safety talk for each chapter once a year" />
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
            </form>
          ) : (
            <p className="text-[15px]">Proposed commission: <strong>{o.commission_pct !== null ? `${Number(o.commission_pct)}% of net sales` : "—"}</strong>{o.commission_note ? ` · ${o.commission_note}` : ""}<span className="block text-xs text-muted">{COMMISSION_HELP}</span></p>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {([
              ["Kind of products", o.signature_category ? SIGNATURE_CATEGORIES[o.signature_category] : null],
              ["Formula", o.formulation_ownership ? `${FORMULA_OWNERSHIP[o.formulation_ownership].label}${o.formulation_note ? `. ${o.formulation_note}` : ""}` : null],
              ["Can develop formulas", o.rnd_support === null ? null : o.rnd_support ? "Yes" : "No"],
              ["Prices valid until", day(o.valid_until)], ["VAT", o.vat_basis ? VAT_BASIS[o.vat_basis] : null],
              ["Delivers finished goods to", o.serviceable_areas], ["Order to delivery", o.lead_time_days !== null ? `${o.lead_time_days} days` : null],
              ["Packaging and labels", o.packaging_supply ? PACKAGING_SUPPLY[o.packaging_supply] : null],
              ["Sample batches", o.sample_availability ? `${SAMPLES[o.sample_availability]}${o.sample_terms ? `. ${o.sample_terms}` : ""}` : null],
              ["Testing", o.qc_testing ? `${o.qc_testing}${o.lab_partner ? ` (lab: ${o.lab_partner})` : ""}` : null], ["Certifications", o.certifications],
              ["Traceability", o.traceability], ["Batch records kept", o.batch_record_years ? `${o.batch_record_years} years` : null],
              ["Recall plan", o.recall_plan], ["Recall contact", o.recall_contact], ["Last recall drill", day(o.mock_recall_on)],
              ["Licence terms", o.ip_terms_accepted_at ? `Accepted (${o.ip_terms_version})` : null], ["Files", docs.length ? `${docs.length} file(s)` : null],
            ] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="whitespace-pre-line break-words">{v || <span className="text-muted">—</span>}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="font-bold">Sites ({sites.length})</h3>
            {sites.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="mt-2 space-y-1 text-[15px]">{sites.map((s) => <li key={s.id} className="break-words"><strong>{s.site_name}</strong>, {s.place_label} · {s.lto_no ? `LTO ${s.lto_no} until ${day(s.lto_valid_until)}` : "no LTO"} · {s.monthly_capacity}/month</li>)}</ul>
            )}
          </div>
          <div>
            <h3 className="font-bold">Products ({products.length})</h3>
            {products.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">{products.map((p) => <li key={p.id} className="p-3"><SigProductSummary p={p} vat={o.vat_basis} site={siteName(p.site_id)} showApproval={!editable || p.approval !== "pending"} /></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-muted">The national team compares toll prices per 100 g or 100 ml (with VAT) for the same type of product, together with permits, quality systems, sample batches and capacity. A regulatory review and a legal review must clear the proposal before it can be chosen.</p>
          </div>

          {editable && (missing.length > 0 ? (
            <div role="status" className="rounded-xl bg-warn-soft p-4 text-warn">
              <p className="font-bold">Still needed before you can send ({missing.length + (o.ip_terms_accepted_at ? 0 : 1)}):</p>
              <ul className="mt-2 space-y-1">
                {missing.map((m) => <li key={m.what}><Link href={`${base}?step=${m.step}`} className="font-semibold underline">{m.what}</Link> <span className="text-sm">(step {m.step})</span></li>)}
                {!o.ip_terms_accepted_at && <li className="font-semibold">Accept the FLAME Signature licence terms above (step 5)</li>}
              </ul>
            </div>
          ) : !o.ip_terms_accepted_at ? (
            <div role="status" className="rounded-xl bg-warn-soft p-4 text-warn"><p className="font-bold">Accept the FLAME Signature licence terms above and save, then you can send.</p></div>
          ) : (
            <form action={submitOffer} className="space-y-4">
              <input type="hidden" name="id" value={o.id} />
              <fieldset className="space-y-2 rounded-xl border border-line p-3 sm:p-4">
                <legend className="px-1 font-bold">Declaration</legend>
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="declaration" value="yes" required className="check mt-0.5" /><span>{SIGNATURE_DECLARATION.en}<span className="mt-1 block text-sm text-muted" lang="fil">{SIGNATURE_DECLARATION.tl}</span></span></label>
              </fieldset>
              <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Sending…">{o.revision > 0 ? `Send as version ${o.revision + 1}` : "Send my FLAME Signature proposal"}</SubmitButton>
            </form>
          ))}
          {o.status === "submitted" && <Notice tone="info">The national team is comparing and scoring your proposal, and checking it in a regulatory review and a legal review. They may ask for sample batches. We will tell you in your Inbox and by email. You can&apos;t change it while it is being reviewed.</Notice>}
          {editable && <div className="border-t border-line pt-4"><Link href={`${base}?step=4`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back to quality, recall and files</Link></div>}
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
          <p className="mt-1 text-sm text-muted">The draft, its sites, products and files are deleted. This can&apos;t be undone.</p>
          <form action={deleteDraftOffer} className="mt-2"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-danger min-h-11" pendingText="Deleting…">Yes, delete the draft</SubmitButton></form>
        </details>
      )}
      {(["submitted", "needs_changes", "selected"].includes(o.status) || (o.status === "draft" && o.revision > 0)) && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Withdraw this proposal…</summary>
          <p className="mt-1 text-sm text-muted">{o.status === "selected" ? "It stops being chosen and any FLAME Signature licence is suspended at once. " : ""}Your answers and files stay, so you can open it again later. Files are deleted 1 year after withdrawing.</p>
          <form action={withdrawOffer} className="mt-2"><input type="hidden" name="id" value={o.id} /><SubmitButton className="btn btn-danger min-h-11" pendingText="Withdrawing…">Yes, withdraw</SubmitButton></form>
        </details>
      )}
    </div>
  );
}
