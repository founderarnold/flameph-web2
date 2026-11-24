import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_OFFERS, OFFER_DONE, OFFER_ERRORS, OFFER_STATUS, PRODUCT_GROUPS, type OfferStatus, type ProductGroup } from "@/lib/offers";
import { SERVICE_CATEGORIES, SERVICE_ERRORS, type OfferKind, type ServiceCategory } from "@/lib/service-offers";
import { SIGNATURE_CATEGORIES, SIGNATURE_ERRORS, type SignatureCategory } from "@/lib/signature";
import { startOffer } from "./actions";

export const metadata = { title: "My Best Offers", robots: { index: false } };

type Row = { id: string; kind: OfferKind; status: OfferStatus; revision: number; title: string | null; product_group: ProductGroup | null; service_category: ServiceCategory | null; signature_category: SignatureCategory | null; valid_until: string | null; updated_at: string };
const tone = (s: OfferStatus) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[OFFER_STATUS[s].tone];
const day = (s: string) => new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

/** The partner's Best Offers: one card per offer with Continue or Open, and a button to start a new one. Accredited
 *  suppliers make supplier offers (Step 2); accredited service providers make service offers (Step 6); accredited toll
 *  manufacturers make FLAME Signature proposals (Step 7). */
export default async function MyOffers({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/offers");
  const [{ data: prof }, { data, error }, { data: app }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories, legal_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("supplier_offers").select("id, kind, status, revision, title, product_group, service_category, signature_category, valid_until, updated_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("partner_applications").select("id, status, category").eq("user_id", user.id).in("category", ["supplier", "service_provider", "toll_manufacturer"]),
  ]);
  const accredited = (c: string) => !!prof && prof.status === "accredited" && (prof.categories as string[]).includes(c);
  const supplier = accredited("supplier");
  const provider = accredited("service_provider");
  const maker = accredited("toll_manufacturer");
  const rows = (data ?? []) as Row[];
  const apps = (app ?? []) as { id: string; status: string; category: string }[];
  const supplierApp = apps.find((a) => a.category === "supplier") ?? null;
  const providerApp = apps.find((a) => a.category === "service_provider") ?? null;
  const makerApp = apps.find((a) => a.category === "toll_manufacturer") ?? null;
  const count = (k: OfferKind) => rows.filter((r) => r.kind === k).length;
  const err = sp.error ? OFFER_ERRORS[sp.error] ?? SERVICE_ERRORS[sp.error] ?? SIGNATURE_ERRORS[sp.error] ?? OFFER_ERRORS.failed : error ? OFFER_ERRORS.unavailable : null;
  const done = sp.done ? OFFER_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › My Best Offers</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited suppliers, service providers at toll manufacturers</p>
        <h1 className="text-3xl font-extrabold text-primary">My Best Offers</h1>
        <p className="mt-1 text-muted">Send your best price and terms for FLAME PH members. The national team compares offers side by side and chooses the Best Offer for each product group or kind of service. Toll manufacturers send FLAME Signature proposals: products made for FLAME PH&apos;s own brand.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Ipadala ang pinakamagandang presyo, singil at kondisyon para sa mga member.</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {!supplier && !provider && !maker && !error && (
        <section className="card space-y-3 border-2 border-flame p-5" aria-labelledby="not-h">
          <h2 id="not-h" className="text-lg font-bold">First, get accredited as a supplier, service provider or toll manufacturer</h2>
          <p className="text-[15px] leading-6">Best Offers are open to suppliers, service providers and toll manufacturers whose application was approved by the national team.
            {supplierApp && <> Your supplier application is: <strong>{supplierApp.status === "approved" ? "Accredited" : supplierApp.status.replace("_", " ")}</strong>.</>}
            {providerApp && <> Your service provider application is: <strong>{providerApp.status === "approved" ? "Accredited" : providerApp.status.replace("_", " ")}</strong>.</>}
            {makerApp && <> Your toll manufacturer application is: <strong>{makerApp.status === "approved" ? "Accredited" : makerApp.status.replace("_", " ")}</strong>.</>}
            {!supplierApp && !providerApp && !makerApp && " You have no supplier, service provider or toll manufacturer application yet."}</p>
          <p className="text-sm text-muted" lang="fil">Kailangan munang ma-approve ang inyong application.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {[supplierApp, providerApp, makerApp].filter(Boolean).map((a) => <Link key={a!.id} href={`/partner-us/apply/${a!.id}`} className="btn btn-flame min-h-11 w-full sm:w-auto">Open my {a!.category === "supplier" ? "supplier" : a!.category === "toll_manufacturer" ? "toll manufacturer" : "service provider"} application</Link>)}
            {!supplierApp && !providerApp && !makerApp && <Link href="/partner-us#apply" className="btn btn-flame min-h-11 w-full sm:w-auto">Apply as a partner</Link>}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-muted">{r.kind === "service" ? `Service · ${r.service_category ? SERVICE_CATEGORIES[r.service_category] : "kind of service not chosen yet"}` : r.kind === "manufacturer" ? `FLAME Signature · ${r.signature_category ? SIGNATURE_CATEGORIES[r.signature_category] : "kind of products not chosen yet"}` : r.product_group ? PRODUCT_GROUPS[r.product_group] : "Product group not chosen yet"}{r.revision > 0 ? ` · version ${r.revision}` : ""}</p>
                <p className="break-words text-lg font-extrabold">{r.title || "Offer name not filled in yet"}</p>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(r.status)}`}>{OFFER_STATUS[r.status].label}</span>
                <p className="mt-1 text-xs text-muted">{r.valid_until ? `${r.kind === "service" ? "Rates" : r.kind === "manufacturer" ? "Toll prices" : "Prices"} valid until ${day(r.valid_until)} · ` : ""}Last saved {new Date(r.updated_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <Link href={`/partner-us/offers/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "draft" || r.status === "needs_changes" ? "Continue" : "Open"}</Link>
            </li>
          ))}
        </ul>
      )}

      {supplier && (
        count("supplier") < MAX_OFFERS ? (
          <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="new-h">
            <h2 id="new-h" className="text-lg font-bold">{count("supplier") ? "Start another product offer" : "Start your first Best Offer"}</h2>
            <p className="text-[15px] leading-6 text-muted">One offer per product group (for example: all your packaging bags). You can add up to 30 products in one offer, each with its own prices. Five short screens; it saves as you go.</p>
            <form action={startOffer}><input type="hidden" name="kind" value="supplier" /><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start a new offer</SubmitButton></form>
          </section>
        ) : <Notice tone="info">{OFFER_ERRORS.limit}</Notice>
      )}
      {provider && (
        count("service") < MAX_OFFERS ? (
          <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="new-svc-h">
            <h2 id="new-svc-h" className="text-lg font-bold">{count("service") ? "Start another service offer" : "Start your first service offer"}</h2>
            <p className="text-[15px] leading-6 text-muted">One offer per kind of service (for example: bookkeeping). Add up to 15 packages, each with what is included, what is not, the member rate and how the member checks the work is done. Five short screens; it saves as you go.</p>
            <p className="text-sm text-muted" lang="fil">Isang alok bawat uri ng serbisyo, na may mga package at singil para sa member.</p>
            <form action={startOffer}><input type="hidden" name="kind" value="service" /><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start a new service offer</SubmitButton></form>
          </section>
        ) : <Notice tone="info">{OFFER_ERRORS.limit}</Notice>
      )}

      {maker && (
        count("manufacturer") < MAX_OFFERS ? (
          <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="new-sig-h">
            <h2 id="new-sig-h" className="text-lg font-bold">{count("manufacturer") ? "Start another FLAME Signature proposal" : "Start your first FLAME Signature proposal"}</h2>
            <p className="text-[15px] leading-6 text-muted">Offer to make products for FLAME PH&apos;s own brand, FLAME Signature. One proposal per kind of product (for example: sauces). Add your plants with their FDA License to Operate, up to 15 products with toll price, MOQ and shelf life, and your batch records and recall plan. A regulatory review and a legal review are done before any product is approved. Five short screens; it saves as you go.</p>
            <p className="text-sm text-muted" lang="fil">Mag-alok na gumawa ng mga produkto para sa sariling brand ng FLAME PH.</p>
            <form action={startOffer}><input type="hidden" name="kind" value="manufacturer" /><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start a FLAME Signature proposal</SubmitButton></form>
          </section>
        ) : <Notice tone="info">{OFFER_ERRORS.limit}</Notice>
      )}

      <section className="card p-4 sm:p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-bold">How the national team chooses</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">
          <li>Product prices are compared per piece, kg or liter, including VAT and delivery, so different pack sizes are fair.</li>
          <li>Service rates are compared for the same kind of package (per hour, per month, per package), with VAT, together with qualifications, service levels and results from past clients.</li>
          <li>Each offer gets a score out of 100. Products: price and member value 30, quality and samples 25, compliance and reliability 20, commission and chapter benefits 15, delivery and support 10. Services: cost and member value 30, qualifications and customer results 25, licences, compliance and service levels 20, commission and chapter benefits 15, availability and after-service 10.</li>
          <li>FLAME Signature proposals are compared per 100 g or 100 ml for the same kind of product, with VAT. Each one also needs a regulatory review (FDA licence, registration, labels, testing, recall) and a legal review (formula ownership, licence terms, trademark use) before it can be chosen.</li>
          <li>A Best Offer needs valid permits, licences and certificates (compliance) and a score of at least 80.</li>
          <li>Reviewers declare any conflict of interest and step aside when they have one. Only the national team decides; chapters do not.</li>
        </ul>
      </section>
    </div>
  );
}
