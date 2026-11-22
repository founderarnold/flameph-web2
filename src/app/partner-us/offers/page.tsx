import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { MAX_OFFERS, OFFER_DONE, OFFER_ERRORS, OFFER_STATUS, PRODUCT_GROUPS, type OfferStatus, type ProductGroup } from "@/lib/offers";
import { startOffer } from "./actions";

export const metadata = { title: "My Best Offers", robots: { index: false } };

type Row = { id: string; status: OfferStatus; revision: number; title: string | null; product_group: ProductGroup | null; valid_until: string | null; updated_at: string };
const tone = (s: OfferStatus) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[OFFER_STATUS[s].tone];
const day = (s: string) => new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

/** The supplier's Best Offers: one card per offer with Continue or Open, and a button to start a new one. */
export default async function MyOffers({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/offers");
  const [{ data: prof }, { data, error }, { data: app }] = await Promise.all([
    supabase.from("partner_profiles").select("status, categories, legal_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("supplier_offers").select("id, status, revision, title, product_group, valid_until, updated_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("partner_applications").select("id, status").eq("user_id", user.id).eq("category", "supplier").maybeSingle(),
  ]);
  const supplier = !!prof && prof.status === "accredited" && (prof.categories as string[]).includes("supplier");
  const rows = (data ?? []) as Row[];
  const err = sp.error ? OFFER_ERRORS[sp.error] ?? OFFER_ERRORS.failed : error ? OFFER_ERRORS.unavailable : null;
  const done = sp.done ? OFFER_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › My Best Offers</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Para sa accredited suppliers</p>
        <h1 className="text-3xl font-extrabold text-primary">My Best Offers</h1>
        <p className="mt-1 text-muted">Send your best price and terms for FLAME PH members. The national team compares offers side by side and chooses the Best Offer for each product group.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">Ipadala ang pinakamagandang presyo at kondisyon para sa mga member.</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {!supplier && !error && (
        <section className="card space-y-3 border-2 border-flame p-5" aria-labelledby="not-h">
          <h2 id="not-h" className="text-lg font-bold">First, get accredited as a supplier</h2>
          <p className="text-[15px] leading-6">Best Offers are open to suppliers whose application was approved by the national team.
            {app ? <> Your supplier application is: <strong>{app.status === "approved" ? "Accredited" : app.status.replace("_", " ")}</strong>.</> : " You have no supplier application yet."}</p>
          <p className="text-sm text-muted" lang="fil">Kailangan munang ma-approve ang inyong supplier application.</p>
          <Link href={app ? `/partner-us/apply/${app.id}` : "/partner-us#apply"} className="btn btn-flame min-h-11 w-full sm:w-auto">{app ? "Open my supplier application" : "Apply as a supplier"}</Link>
        </section>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-muted">{r.product_group ? PRODUCT_GROUPS[r.product_group] : "Product group not chosen yet"}{r.revision > 0 ? ` · version ${r.revision}` : ""}</p>
                <p className="break-words text-lg font-extrabold">{r.title || "Offer name not filled in yet"}</p>
                <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(r.status)}`}>{OFFER_STATUS[r.status].label}</span>
                <p className="mt-1 text-xs text-muted">{r.valid_until ? `Prices valid until ${day(r.valid_until)} · ` : ""}Last saved {new Date(r.updated_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <Link href={`/partner-us/offers/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "draft" || r.status === "needs_changes" ? "Continue" : "Open"}</Link>
            </li>
          ))}
        </ul>
      )}

      {supplier && (
        rows.length < MAX_OFFERS ? (
          <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="new-h">
            <h2 id="new-h" className="text-lg font-bold">{rows.length ? "Start another offer" : "Start your first Best Offer"}</h2>
            <p className="text-[15px] leading-6 text-muted">One offer per product group (for example: all your packaging bags). You can add up to 30 products in one offer, each with its own prices. Five short screens; it saves as you go.</p>
            <form action={startOffer}><SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Starting…">Start a new offer</SubmitButton></form>
          </section>
        ) : <Notice tone="info">{OFFER_ERRORS.limit}</Notice>
      )}

      <section className="card p-4 sm:p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-bold">How the national team chooses</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-muted">
          <li>Prices are compared per piece, kg or liter, including VAT and delivery, so different pack sizes are fair.</li>
          <li>Each offer gets a score out of 100: price and member value 30, quality and samples 25, compliance and reliability 20, commission and chapter benefits 15, delivery and support 10.</li>
          <li>A Best Offer needs valid permits and certificates (compliance) and a score of at least 80.</li>
          <li>Reviewers declare any conflict of interest and step aside when they have one. Only the national team decides; chapters do not.</li>
        </ul>
      </section>
    </div>
  );
}
