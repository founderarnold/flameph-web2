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
  BASE_UNITS, unitCount, COMMISSION_HELP, ITEM_COLS, landedCost, MAX_ITEMS, MAX_OFFER_FILES, MAX_TIERS, memberDiscount, OFFER_COLS, OFFER_DECLARATION, OFFER_DONE,
  OFFER_EDITABLE, OFFER_ERRORS, OFFER_FILE_KEYS, OFFER_FILE_TYPES, OFFER_LAST_STEP, OFFER_REASONS, OFFER_STATUS, OFFER_STEPS, offerMissing, peso,
  PRODUCT_GROUPS, SAMPLES, SHIPPING_TERMS, STOCK, VAT_BASIS, type ItemRow, type OfferRow, type OfferStatus,
} from "@/lib/offers";
import {
  deleteDraftOffer, deleteItem, deleteOfferFile, reopenOffer, saveItem, saveOfferStep, submitOffer, uploadOfferFile, withdrawOffer,
} from "../actions";

export const metadata = { title: "Best Offer", robots: { index: false } };

type Doc = { id: string; doc_type: string; item_id: string | null; file_name: string; size_bytes: number; uploaded_at: string };
type History = { id: string; action: string; reasons: string[]; note: string | null; created_at: string; revision: number };

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null);
const tone = (s: OfferStatus) => ({ ok: "ok", warn: "warn", danger: "danger", info: "info" } as const)[OFFER_STATUS[s].tone];
const ACTION: Record<string, string> = { submitted: "Sent", needs_changes: "Review team asked for changes", selected: "Chosen as a Best Offer", not_selected: "Not chosen this time", withdrawn: "Withdrawn", reopened: "Opened again for changes" };
const num = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function SaveButtons({ step }: { step: number }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
      <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
      {step < OFFER_LAST_STEP && <button type="submit" name="intent" value="next" className="btn btn-primary min-h-11 w-full sm:w-auto">Save and continue →</button>}
    </div>
  );
}

/** One product as a small card: what it is, member price, landed cost per comparison unit. */
function ItemSummary({ it, vat }: { it: ItemRow; vat: OfferRow["vat_basis"] }) {
  const lc = landedCost(it, vat);
  const disc = memberDiscount(it);
  return (
    <div className="min-w-0">
      <p className="break-words font-bold">{it.product_name}{it.brand ? <span className="font-normal text-muted"> · {it.brand}</span> : null}{it.sku ? <span className="font-normal text-muted"> · SKU {it.sku}</span> : null}</p>
      <p className="text-sm">Sold by <strong>{it.sell_unit}</strong> ({unitCount(it.base_qty, it.base_unit)}) · member price <strong>{peso(it.member_price)}</strong>{disc !== null ? ` (${disc}% off regular ${peso(it.regular_price)})` : ""}</p>
      <p className="text-sm text-muted">Landed cost: {peso(lc.perSellUnit)} per {it.sell_unit} = <strong className="text-fg">{peso(lc.perBaseUnit)} per {BASE_UNITS[it.base_unit].label}</strong> · MOQ {it.moq} · {STOCK[it.stock_status]}</p>
      {it.tiers.length > 0 && <p className="text-xs text-muted">Bulk prices: {it.tiers.map((t) => `${t.min_qty}+ at ${peso(t.price)}`).join(" · ")}</p>}
    </div>
  );
}

export default async function OfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; item?: string; done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/partner-us/offers/${id}`);
  const [{ data: row }, { data: itemRows }, { data: docRows }, { data: histRows }] = await Promise.all([
    supabase.from("supplier_offers").select(OFFER_COLS).eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("supplier_offer_items").select(ITEM_COLS).eq("offer_id", id).order("position"),
    supabase.from("vetting_documents").select("id, doc_type, item_id, file_name, size_bytes, uploaded_at").eq("offer_id", id).eq("user_id", user.id).is("deleted_at", null).order("uploaded_at"),
    supabase.from("supplier_offer_history").select("id, action, reasons, note, created_at, revision").eq("offer_id", id).order("created_at", { ascending: false }).limit(40),
  ]);
  if (!row) notFound();
  const o = row as unknown as OfferRow;
  const items = (itemRows ?? []) as unknown as ItemRow[];
  const docs = (docRows ?? []) as Doc[];
  const history = (histRows ?? []) as History[];
  const editable = OFFER_EDITABLE.includes(o.status);
  const step = editable ? Math.min(OFFER_LAST_STEP, Math.max(1, Number(sp.step) || 1)) : OFFER_LAST_STEP;
  const photos = docs.filter((d) => d.doc_type === "product_photo");
  const missing = offerMissing(o, items.length, photos.length);
  const err = sp.error ? OFFER_ERRORS[sp.error] ?? OFFER_ERRORS.failed : null;
  const done = sp.done ? OFFER_DONE[sp.done] : null;
  const editItem = step === 2 && editable ? (sp.item === "new" ? "new" : items.find((x) => x.id === sp.item) ?? null) : null;
  const ei = editItem && editItem !== "new" ? editItem : null;
  const base = `/partner-us/offers/${o.id}`;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › <Link href="/partner-us/offers" className="underline">My Best Offers</Link>
      </nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Best Offer ng supplier</p>
        <h1 className="break-words text-2xl font-extrabold text-primary sm:text-3xl">{o.title || "New Best Offer"}</h1>
        <div className="mt-2"><Notice tone={tone(o.status)}>Status: <strong>{OFFER_STATUS[o.status].label}</strong>{o.revision > 0 ? ` · version ${o.revision}` : ""}</Notice></div>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {(o.status === "needs_changes" || o.status === "not_selected") && (o.decision_reasons.length > 0 || o.decision_note) && (
        <section className="card space-y-2 border-2 border-warn p-4" aria-labelledby="reasons-h">
          <h2 id="reasons-h" className="text-lg font-bold">{o.status === "needs_changes" ? "What the review team asks you to change" : "Why it was not chosen this time"}</h2>
          <ul className="list-disc space-y-1 pl-5">{o.decision_reasons.map((r) => <li key={r}>{OFFER_REASONS[r as keyof typeof OFFER_REASONS] ?? r}</li>)}</ul>
          {o.decision_note && <p className="whitespace-pre-line text-[15px]"><strong>Note:</strong> {o.decision_note}</p>}
        </section>
      )}
      {o.status === "selected" && (
        <section className="card space-y-2 border-2 border-ok p-4" aria-labelledby="sel-h">
          <h2 id="sel-h" className="text-lg font-bold text-ok">Your offer was chosen as a Best Offer</h2>
          {o.selection_reason && <p className="whitespace-pre-line text-[15px]">{o.selection_reason}</p>}
          <p className="text-sm text-muted">The national team will contact you about the next steps. Territories and the commission agreement come later, in writing, with MarketplacePH Online Store. Nothing is final until then.</p>
        </section>
      )}
      {["not_selected", "withdrawn", "selected"].includes(o.status) && (
        <form action={reopenOffer} className="card space-y-2 p-4"><input type="hidden" name="id" value={o.id} />
          <p className="text-[15px]">{o.status === "selected" ? "Need to change prices or add products? Opening it for changes stops it being a Best Offer until the national team reviews the new version." : "You can change the offer and send it again as a new version."}</p>
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Opening…">{o.status === "selected" ? "Change this offer" : "Change and send again"}</SubmitButton>
        </form>
      )}

      {editable && (
        <nav aria-label="Offer steps" className="card p-3">
          <p className="px-1 text-sm font-semibold sm:hidden">Step {step} of {OFFER_LAST_STEP}: {OFFER_STEPS[step - 1].title}</p>
          <div className="mx-1 mt-2 h-2 overflow-hidden rounded-full bg-bg-soft sm:hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${(step / OFFER_LAST_STEP) * 100}%` }} /></div>
          <ol className="mt-2 flex gap-1 overflow-x-auto sm:mt-0 sm:grid sm:grid-cols-5">
            {OFFER_STEPS.map((s) => (
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
        <form action={saveOfferStep} className="card space-y-4 p-4 sm:p-6">
          <input type="hidden" name="id" value={o.id} /><input type="hidden" name="step" value={step} />
          <div>
            <h2 className="text-xl font-extrabold">{OFFER_STEPS[step - 1].title}</h2>
            <p className="text-sm text-muted" lang="fil">{OFFER_STEPS[step - 1].fil}. Puwedeng i-save at ituloy mamaya.</p>
          </div>
          {step === 1 && <>
            <Text name="title" label="Name of the offer" value={o.title} need max={150} placeholder="e.g. Kraft paper bags for food stalls" help="A short name that says what you are offering." />
            <Select name="product_group" label="Product group" value={o.product_group} need options={Object.entries(PRODUCT_GROUPS)} help="Offers in the same group are compared with each other." />
            <Text name="valid_until" label="Prices valid until" value={o.valid_until} need type="date" max={10} help="Hanggang kailan ninyo kayang ibigay ang presyong ito?" />
            <Select name="vat_basis" label="VAT" value={o.vat_basis} need options={Object.entries(VAT_BASIS)} help="So members' prices are compared fairly, we add 12% VAT to prices typed without it." />
          </>}
          {step === 3 && <>
            <TextArea name="serviceable_areas" label="Areas you deliver to (cities, municipalities or provinces)" value={o.serviceable_areas} need max={1000} rows={3} placeholder="e.g. Quezon City, Manila, Caloocan; all of Rizal and Cavite" help="Isulat ang mga LGU o probinsya na kaya ninyong i-deliver." />
            <Select name="shipping_terms" label="How members get the products" value={o.shipping_terms} need options={Object.entries(SHIPPING_TERMS)} />
            <Text name="shipping_note" label="Delivery details (optional)" value={o.shipping_note} max={500} placeholder="e.g. Free delivery for orders of ₱5,000 or more within Metro Manila" />
            <Text name="lead_time_days" label="Days from order to delivery" value={num(o.lead_time_days)} need max={3} inputMode="numeric" placeholder="e.g. 5" help="Usual number of days. You can give a different number per product." />
            <TextArea name="warranty" label="Warranty (optional)" value={o.warranty} max={500} rows={2} placeholder="e.g. 6 months against factory defects" />
            <TextArea name="returns_policy" label="Returns and replacements" value={o.returns_policy} max={800} rows={3} placeholder="e.g. Damaged or wrong items replaced within 7 days of delivery" help="Ano ang gagawin ninyo kung sira, kulang o mali ang dumating?" />
            <Select name="sample_availability" label="Samples" value={o.sample_availability} need options={Object.entries(SAMPLES)} help="Chapter testers may test samples in the next step of the program." />
            <Text name="sample_terms" label="Sample terms (optional)" value={o.sample_terms} max={500} placeholder="e.g. 2 free pieces per chapter; member pays shipping" />
            <Text name="certifications" label="Certifications for these products (optional)" value={o.certifications} max={500} placeholder="e.g. FDA CPR, Halal, ISO 9001" help="Upload the certificates on the next screen." />
          </>}
          <SaveButtons step={step} />
        </form>
      )}

      {editable && step === 2 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="items-h">
          <div>
            <h2 id="items-h" className="text-xl font-extrabold">Products and prices</h2>
            <p className="text-sm text-muted" lang="fil">Ilagay ang bawat produkto at ang presyo para sa member. Hanggang {MAX_ITEMS} produkto.</p>
          </div>
          {items.length === 0 && !editItem && <Notice tone="info">No products yet. Add your first product below.</Notice>}
          {items.length > 0 && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {items.map((it) => (
                <li key={it.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <ItemSummary it={it} vat={o.vat_basis} />
                  <span className="flex shrink-0 gap-2">
                    <Link href={`${base}?step=2&item=${it.id}#item-form`} className="btn btn-outline min-h-11 px-3 text-sm">Edit</Link>
                    <form action={deleteItem}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="item_id" value={it.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm text-danger" pendingText="Removing…">Remove</SubmitButton></form>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {editItem ? (
            <form id="item-form" action={saveItem} className="scroll-mt-24 space-y-4 rounded-xl border-2 border-primary p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} />{ei && <input type="hidden" name="item_id" value={ei.id} />}
              <h3 className="text-lg font-extrabold">{ei ? `Edit: ${ei.product_name}` : "Add a product"}</h3>
              <fieldset className="space-y-4">
                <legend className="font-bold">The product</legend>
                <Text name="product_name" label="Product name" value={ei?.product_name} need max={150} placeholder="e.g. Kraft paper bag #8, brown" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="brand" label="Brand (optional)" value={ei?.brand} max={100} />
                  <Text name="sku" label="SKU or item code (optional)" value={ei?.sku} max={60} />
                </div>
                <TextArea name="description" label="Description (optional)" value={ei?.description} max={1000} rows={3} placeholder="Size, material, ingredients, shelf life, colors" />
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">How it is sold</legend>
                <Text name="sell_unit" label="Selling unit" value={ei?.sell_unit} need max={60} placeholder="e.g. pack of 100, 18 L tin, 25 kg sack" help="Paano ito binibili: per pack, box, sack, piraso?" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select name="base_unit" label="Compare prices per" value={ei?.base_unit ?? "piece"} need options={Object.entries(BASE_UNITS).map(([k, v]) => [k, `per ${v.label}`])} help="piece: pcs, bottles, bags · kg: 500 g = 0.5 · liter: 500 ml = 0.5 · meter: rolls, cloth · set: kits" />
                  <Text name="base_qty" label="How many of those in one selling unit?" value={ei ? num(ei.base_qty) : ""} need max={12} inputMode="decimal" placeholder="e.g. 100" help="A pack of 100 bags = 100. A 25 kg sack = 25." />
                </div>
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">Prices per selling unit (₱)</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Text name="regular_price" label="Regular price" value={ei ? num(ei.regular_price) : ""} max={14} inputMode="decimal" placeholder="450" help="Your usual price for anyone." />
                  <Text name="wholesale_price" label="Wholesale price (optional)" value={ei ? num(ei.wholesale_price) : ""} max={14} inputMode="decimal" placeholder="400" />
                  <Text name="member_price" label="FLAME PH member price" value={ei ? num(ei.member_price) : ""} need max={14} inputMode="decimal" placeholder="380" help="Presyo para sa member." />
                </div>
                <div>
                  <p className="label">Lower prices for bigger orders (optional)</p>
                  <p className="field-help">From this many selling units, this price each. Example: from 50 packs, ₱360.</p>
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: MAX_TIERS }, (_, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2">
                        <input name={`tier_min_${i}`} aria-label={`Quantity price ${i + 1}: from how many units`} defaultValue={num(ei?.tiers[i]?.min_qty)} inputMode="numeric" maxLength={10} placeholder="From qty" className="input" />
                        <input name={`tier_price_${i}`} aria-label={`Quantity price ${i + 1}: price each (₱)`} defaultValue={num(ei?.tiers[i]?.price)} inputMode="decimal" maxLength={14} placeholder="₱ each" className="input" />
                      </div>
                    ))}
                  </div>
                </div>
                <Text name="shipping_per_unit" label="Delivery cost per selling unit (₱)" value={ei ? num(ei.shipping_per_unit) : ""} max={14} inputMode="decimal" placeholder="0" help="Your estimate of the delivery fee for one unit. Type 0 or leave blank if delivery is free." />
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="font-bold">Supply</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Text name="moq" label="Minimum order (selling units)" value={ei ? num(ei.moq) : ""} max={10} inputMode="numeric" placeholder="1" help="MOQ: the smallest order you accept." />
                  <Text name="monthly_capacity" label="How many you can supply per month (optional)" value={ei ? num(ei.monthly_capacity) : ""} max={12} inputMode="numeric" placeholder="e.g. 2000" />
                  <Select name="stock_status" label="Stock" value={ei?.stock_status ?? "in_stock"} options={Object.entries(STOCK)} />
                  <Text name="item_lead_time_days" label="Days to deliver this product (optional)" value={ei ? num(ei.lead_time_days) : ""} max={3} inputMode="numeric" help="Only if different from the usual delivery time." />
                </div>
              </fieldset>
              <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
                <Link href={`${base}?step=2`} className="btn btn-outline min-h-11 w-full sm:w-auto">Cancel</Link>
                <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save product</SubmitButton>
              </div>
            </form>
          ) : items.length < MAX_ITEMS ? (
            <Link href={`${base}?step=2&item=new#item-form`} className="btn btn-flame min-h-11 w-full sm:w-auto">+ Add a product</Link>
          ) : <Notice tone="info">{OFFER_ERRORS.item_limit}</Notice>}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <Link href={`${base}?step=1`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back</Link>
            <Link href={`${base}?step=3`} className="btn btn-primary min-h-11 w-full sm:w-auto">Continue →</Link>
          </div>
        </section>
      )}

      {editable && step === 4 && (
        <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="files-h">
          <div>
            <h2 id="files-h" className="text-xl font-extrabold">Photos and files</h2>
            <p className="text-sm text-muted" lang="fil">Mag-upload ng litrato ng produkto at iba pang file. Naka-encrypt at pribado ang mga ito.</p>
          </div>
          <p className="flex items-start gap-2 text-[15px]"><span aria-hidden className={photos.length ? "text-ok" : "text-muted"}>{photos.length ? "✓" : "○"}</span><span><strong>At least one product photo</strong>{photos.length ? ` — ${photos.length} received` : " — needed to send"}</span></p>
          {docs.length < MAX_OFFER_FILES ? (
            <form action={uploadOfferFile} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} />
              <div className="field">
                <label htmlFor="doc_type" className="label">What kind of file is this?</label>
                <select id="doc_type" name="doc_type" required className="input" defaultValue={photos.length ? "" : "product_photo"}>
                  <option value="">Choose…</option>
                  {OFFER_FILE_KEYS.map((k) => <option key={k} value={k}>{OFFER_FILE_TYPES[k].label}</option>)}
                </select>
              </div>
              {items.length > 0 && (
                <div className="field">
                  <label htmlFor="item_id" className="label">Which product is in the photo? (for product photos)</label>
                  <select id="item_id" name="item_id" className="input" defaultValue="">
                    <option value="">The whole offer / several products</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.product_name}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="file" className="label">File</label>
                <ShrinkPhotoInput id="file" maxBytes={PARTNER_DOC_MAX_BYTES} maxSide={PHOTO_MAX_SIDE} />
                <p className="field-help">PDF, JPG, PNG or WEBP, up to 4 MB. Photos are made smaller on your phone before sending.</p>
              </div>
              <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Uploading…">Upload securely</SubmitButton>
            </form>
          ) : <Notice tone="info">{OFFER_ERRORS.too_many}</Notice>}
          <div>
            <h3 className="font-bold">Files you sent ({docs.length} of {MAX_OFFER_FILES})</h3>
            {docs.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <ul className="divide-y divide-line">
                {docs.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{OFFER_FILE_TYPES[x.doc_type as keyof typeof OFFER_FILE_TYPES]?.label ?? x.doc_type}{x.item_id ? <span className="font-normal text-muted"> · {items.find((i) => i.id === x.item_id)?.product_name}</span> : null}</span>
                      <span className="block truncate text-xs text-muted">{x.file_name} · {kb(x.size_bytes)} · {when(x.uploaded_at)}</span></span>
                    <form action={deleteOfferFile}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="doc_id" value={x.id} />
                      <SubmitButton className="btn btn-outline min-h-11 px-3 text-sm" pendingText="Deleting…">Delete</SubmitButton></form>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">For your privacy you can&apos;t open the files here; only the national review team can. To replace one, delete it and upload again.</p>
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
            <form action={saveOfferStep} className="space-y-3 rounded-xl border border-line p-3 sm:p-4">
              <input type="hidden" name="id" value={o.id} /><input type="hidden" name="step" value={OFFER_LAST_STEP} />
              <Text name="commission_pct" label="Proposed commission (% of net sales)" value={num(o.commission_pct)} need max={6} inputMode="decimal" placeholder="e.g. 5" help={COMMISSION_HELP} />
              <TextArea name="commission_note" label="Other benefits for members or chapters (optional)" value={o.commission_note} max={500} rows={2} placeholder="e.g. Free delivery for chapter group orders; product training for members" />
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
            </form>
          ) : (
            <p className="text-[15px]">Proposed commission: <strong>{o.commission_pct !== null ? `${Number(o.commission_pct)}% of net sales` : "—"}</strong>{o.commission_note ? ` · ${o.commission_note}` : ""}<span className="block text-xs text-muted">{COMMISSION_HELP}</span></p>
          )}

          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {([
              ["Product group", o.product_group ? PRODUCT_GROUPS[o.product_group] : null], ["Prices valid until", day(o.valid_until)],
              ["VAT", o.vat_basis ? VAT_BASIS[o.vat_basis] : null], ["Areas you deliver to", o.serviceable_areas],
              ["How members get the products", o.shipping_terms ? `${SHIPPING_TERMS[o.shipping_terms]}${o.shipping_note ? `. ${o.shipping_note}` : ""}` : null],
              ["Days from order to delivery", o.lead_time_days !== null ? `${o.lead_time_days} days` : null], ["Warranty", o.warranty], ["Returns and replacements", o.returns_policy],
              ["Samples", o.sample_availability ? `${SAMPLES[o.sample_availability]}${o.sample_terms ? `. ${o.sample_terms}` : ""}` : null], ["Certifications", o.certifications],
              ["Files", docs.length ? `${photos.length} photo(s), ${docs.length - photos.length} other file(s)` : null],
            ] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>
            ))}
          </dl>
          <div>
            <h3 className="font-bold">Products ({items.length})</h3>
            {items.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">{items.map((it) => <li key={it.id} className="p-3"><ItemSummary it={it} vat={o.vat_basis} /></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-muted">Landed cost = member price (with VAT) + your delivery cost per unit. It is how the national team compares offers.</p>
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
                <label className="flex min-h-11 cursor-pointer items-start gap-3"><input type="checkbox" name="declaration" value="yes" required className="check mt-0.5" /><span>{OFFER_DECLARATION.en}<span className="mt-1 block text-sm text-muted" lang="fil">{OFFER_DECLARATION.tl}</span></span></label>
              </fieldset>
              <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Sending…">{o.revision > 0 ? `Send as version ${o.revision + 1}` : "Send my Best Offer"}</SubmitButton>
            </form>
          ))}
          {o.status === "submitted" && <Notice tone="info">The national team is comparing and scoring your offer. We will tell you in your Inbox and by email. You can&apos;t change it while it is being reviewed.</Notice>}
          {editable && <div className="border-t border-line pt-4"><Link href={`${base}?step=4`} className="btn btn-outline min-h-11 w-full sm:w-auto">← Back to photos and files</Link></div>}
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
                {h.reasons.length > 0 && <span className="block text-muted">{h.reasons.map((r) => OFFER_REASONS[r as keyof typeof OFFER_REASONS] ?? r).join("; ")}</span>}
                {h.note && <span className="block whitespace-pre-line">{h.note}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {o.status === "draft" && o.revision === 0 && (
        <details className="card p-4">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Delete this draft…</summary>
          <p className="mt-1 text-sm text-muted">The draft, its products and files are deleted. This can&apos;t be undone.</p>
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
