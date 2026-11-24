import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { OFFER_ERRORS } from "@/lib/offers";
import { day } from "@/lib/partner-cases";
import {
  BATCH_COLS, BATCH_STATUS, BATCH_TYPES, LICENCE_COLS, LICENCE_STATUS, QC_RESULT, SIGNATURE_DONE, SIGNATURE_ERRORS, type BatchRow, type LicenceRow,
} from "@/lib/signature";
import { saveBatch } from "./actions";
import { BatchFields, type Prod, type Site } from "./BatchFields";

export const metadata = { title: "FLAME Signature", robots: { index: false } };

const TONE = { ok: "bg-ok-soft text-ok", info: "bg-primary-soft text-primary", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger" } as const;

/** The toll manufacturer's FLAME Signature desk: licences from the national team (which products, plants and areas), the
 *  rules for using the mark, and batch records (sample, pilot and production lots) with a form to record a new one. */
export default async function MySignature({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/signature");
  const [{ data: prof }, { data: offers, error }, { data: lic }, { data: bat }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories").eq("user_id", user.id).maybeSingle(),
    supabase.from("supplier_offers").select("id, title, status").eq("user_id", user.id).eq("kind", "manufacturer").neq("status", "withdrawn"),
    supabase.from("signature_licences").select(LICENCE_COLS).eq("partner_user_id", user.id).neq("status", "draft").order("created_at", { ascending: false }),
    supabase.from("signature_batches").select(BATCH_COLS).eq("partner_user_id", user.id).order("produced_on", { ascending: false }).limit(100),
  ]);
  const maker = !!prof && prof.status === "accredited" && (prof.categories as string[]).includes("toll_manufacturer");
  const offerIds = (offers ?? []).map((o) => o.id as string);
  const [{ data: prodRows }, { data: siteRows }] = offerIds.length
    ? await Promise.all([
      supabase.from("signature_products").select("id, product_name, net_content, site_id, approval, shelf_life_months, offer_id").in("offer_id", offerIds).order("position"),
      supabase.from("signature_sites").select("id, site_name, offer_id").in("offer_id", offerIds).order("position"),
    ])
    : [{ data: [] }, { data: [] }];
  const products = (prodRows ?? []) as Prod[];
  const sites = (siteRows ?? []) as Site[];
  const licences = (lic ?? []) as unknown as LicenceRow[];
  const batches = (bat ?? []) as unknown as BatchRow[];
  const pName = (id: string) => products.find((p) => p.id === id)?.product_name ?? "(product removed)";
  const sName = (id: string | null) => sites.find((s) => s.id === id)?.site_name ?? "—";
  const err = sp.error ? SIGNATURE_ERRORS[sp.error] ?? OFFER_ERRORS[sp.error] ?? OFFER_ERRORS.failed : error ? OFFER_ERRORS.unavailable : null;
  const done = sp.done ? SIGNATURE_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › FLAME Signature</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited toll manufacturers</p>
        <h1 className="text-3xl font-extrabold text-primary">FLAME Signature</h1>
        <p className="mt-1 text-muted">Your licences to make FLAME PH&apos;s own-brand products, and the record of every batch you make. Proposals are in <Link href="/partner-us/offers" className="underline">My Best Offers</Link>.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Ang inyong lisensya at talaan ng bawat batch.</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {!maker && !error && (
        <section className="card space-y-3 border-2 border-flame p-5" aria-labelledby="not-h">
          <h2 id="not-h" className="text-lg font-bold">For accredited toll manufacturers</h2>
          <p className="text-[15px] leading-6">FLAME Signature is open to manufacturers whose toll manufacturer application was approved by the national team.</p>
          <Link href="/partner-us#apply" className="btn btn-flame min-h-11 w-full sm:w-auto">Apply as a toll manufacturer</Link>
        </section>
      )}

      <section className="card space-y-2 p-4 sm:p-5" aria-labelledby="mark-h">
        <h2 id="mark-h" className="text-lg font-bold">Using the FLAME Signature name and logo</h2>
        <ul className="list-disc space-y-1 pl-5 text-[15px] leading-6">
          <li>Only on the <strong>approved products</strong> listed in an <strong>active licence</strong>, made at the licensed plants.</li>
          <li>Only for sale in the <strong>areas with distribution rights</strong> in that licence, and only between its start and end dates.</li>
          <li>Only on <strong>production batches released</strong> by the national team. Sample and pilot batches never carry the mark for sale.</li>
          <li>Making the product (manufacturing rights) and selling it in an area (distribution rights) are separate rights.</li>
        </ul>
        <p className="text-sm text-muted" lang="fil">Gamitin lang ang pangalan at logo sa mga approved na produkto, sa mga lugar at petsang nasa lisensya, at sa mga batch na na-release ng national team.</p>
      </section>

      <section className="space-y-3" aria-labelledby="lic-h">
        <h2 id="lic-h" className="text-xl font-extrabold">My licences</h2>
        {licences.length === 0 ? <Notice tone="info">No licence yet. After the national team chooses your proposal and both reviews clear it, they issue a licence here.</Notice> : (
          <ul className="space-y-3">
            {licences.map((l) => (
              <li key={l.id} className="card space-y-1 p-4">
                <p className="text-xs font-bold uppercase text-muted">{l.ref_no}</p>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[LICENCE_STATUS[l.status].tone]}`}>{LICENCE_STATUS[l.status].label}</span>
                <p className="text-sm">{day(l.start_date)} to {day(l.end_date)}</p>
                <p className="break-words text-sm"><span className="font-semibold">Products:</span> {l.product_ids.map(pName).join(", ")}</p>
                <p className="break-words text-sm"><span className="font-semibold">Plants:</span> {l.site_ids.map(sName).join(", ")}</p>
                <p className="text-sm text-muted">{l.mfg_appointment_ids.length} manufacturing right(s) · {l.dist_appointment_ids.length} distribution right(s)</p>
                {l.terms_note && <p className="whitespace-pre-line break-words text-sm">{l.terms_note}</p>}
                {l.status_reason && l.status !== "active" && <p className="break-words text-sm text-warn">Reason: {l.status_reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="bat-h">
        <h2 id="bat-h" className="text-xl font-extrabold">Batch records</h2>
        {batches.length === 0 ? <Notice tone="info">No batches recorded yet.</Notice> : (
          <ul className="space-y-2">
            {batches.map((b) => (
              <li key={b.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-muted">{b.ref_no} · {BATCH_TYPES[b.batch_type].label}</p>
                  <p className="break-words font-bold">{b.product_name} · lot {b.lot_no}</p>
                  <p className="text-sm text-muted">Made {day(b.produced_on)} · expires {day(b.expiry_on)} · {b.quantity.toLocaleString("en-PH")} {b.unit} · QC {QC_RESULT[b.qc_result].toLowerCase()}</p>
                  <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${TONE[BATCH_STATUS[b.status].tone]}`}>{BATCH_STATUS[b.status].label}</span>
                </div>
                <Link href={`/partner-us/signature/batches/${b.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {maker && (products.length === 0 ? <Notice tone="info">To record batches, first add products to a FLAME Signature proposal in My Best Offers.</Notice> : (
        <form id="record" action={saveBatch} className="card scroll-mt-24 space-y-4 p-4 sm:p-6" aria-labelledby="rec-h">
          <h2 id="rec-h" className="text-lg font-bold">Record a batch</h2>
          <BatchFields products={products} sites={sites} />
          <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Saving…">Record the batch</SubmitButton>
        </form>
      ))}
    </div>
  );
}
