import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { Faq } from "@/components/Faq";
import { SubmitButton } from "@/components/SubmitButton";
import { meta } from "@/lib/meta";
import { getSession } from "@/lib/auth";
import { CATEGORY_KEYS, PARTNER_CATEGORIES, PARTNER_DOC_TYPES, STATUS, requiredDocs, type PartnerCategory, type PartnerStatus } from "@/lib/partner";
import { startApplication } from "./actions";

export const metadata = meta(
  "Become an Accredited Partner",
  "Suppliers, service providers and toll manufacturers: apply to be an accredited FLAME PH partner and offer your best price to Filipino MSMEs.",
  "/partner-us",
);

const HOW = [
  { t: "Sign up or log in", d: "Use your free FLAME PH member account. No second account.", tl: "Gamitin ang inyong FLAME PH account." },
  { t: "Fill in the form", d: "Five short screens. Save anytime and continue later, even on another phone.", tl: "Puwedeng i-save at ituloy mamaya." },
  { t: "Upload your documents", d: "Permits and registration, as PDF or phone photos. They are encrypted and private.", tl: "Ligtas at pribado ang mga dokumento." },
  { t: "National team reviews", d: "We check your papers and may ask for changes. Only the national team can approve.", tl: "Ang national team lang ang nag-aapruba." },
];

const FAQ = [
  { q: "What is an accredited partner?", a: "A supplier, service provider or toll manufacturer whose business papers were checked by the FLAME PH national team. Accredited suppliers can then send their Best Offer (prices for members, minimum orders, delivery areas) at My Best Offers, and the national team compares the offers side by side." },
  { q: "Is this the same as Partner With Us?", a: "No. Partner With Us (/partners) is for LGUs, schools, companies, NGOs and foundations that want to work with FLAME PH on programs. This page is for businesses that want to sell products or services to members." },
  { q: "How much does it cost?", a: "Applying is free. FLAME PH never asks for money to accredit you, and flameph.org never collects or holds money." },
  { q: "Who sees my documents and TIN?", a: "Only the national review team (founder, admins and national reviewers). Documents are encrypted, and every time one is opened it is logged. Chapter coordinators see only your business name, category, town and status. Nothing is shown publicly." },
  { q: "How do territories work?", a: "After accreditation (usually after your Best Offer is chosen), the national team may appoint you to an area: the whole country, regions, provinces, or cities and towns, for one product or service category, exclusive or not, with set selling channels, dates and targets. Only the national team appoints. You can nominate a sub-partner inside your own area at My territories, but you cannot appoint one yourself." },
  { q: "How do commissions work?", a: "The commission rate is agreed in a signed agreement with MarketplacePH Online Store. Until then, the program's default targets are the starting point: supplier 5%, service provider 12%, toll manufacturer 8% of collected net sales, shared between the national office and the regional, provincial and city or town chapters. Only sales collected by MarketplacePH Online Store count, and refunds take the commission back. flameph.org only records the figures at My commissions; it never collects or pays money, and nothing is paid automatically." },
  { q: "Can a chapter approve me?", a: "No. Chapters can recommend and, later, test samples, but only the FLAME PH national team approves accreditation." },
  { q: "What if my application needs changes or is not approved?", a: "You will see the reasons in your application, in your Inbox and by email. Fix what is listed and send it again. Your saved answers and documents stay." },
  { q: "Kailangan ko bang tapusin agad?", a: "Hindi. Naka-save ang bawat screen. Bumalik lang sa page na ito at i-tap ang Continue." },
];

type Mine = { id: string; category: PartnerCategory; status: PartnerStatus };

export default async function PartnerUsPage() {
  const { supabase, user } = await getSession();
  let mine: Mine[] = [];
  if (supabase && user) {
    const { data } = await supabase.from("partner_applications").select("id, category, status").eq("user_id", user.id);
    mine = (data ?? []) as Mine[];
  }
  const byCat = new Map(mine.map((m) => [m.category, m]));

  return (
    <>
      <PageHero status="live" fil="Para sa suppliers, service providers at toll manufacturers" title="Become an Accredited Partner" path="/partner-us"
        intro="Offer your products and services to Filipino MSMEs through FLAME PH. Apply once, get checked by the national team, then send your best offer to members.">
        <a href="#apply" className="btn btn-flame">Apply now ↓</a>
        {user && mine.length > 0 && <Link href="/partner-us/apply" className="btn btn-outline">My applications</Link>}
        {user && mine.some((m) => m.category === "supplier" && m.status === "approved") && <Link href="/partner-us/offers" className="btn btn-outline">My Best Offers</Link>}
        {user && mine.some((m) => m.status === "approved") && <Link href="/partner-us/territories" className="btn btn-outline">My territories</Link>}
        {user && mine.some((m) => m.status === "approved") && <Link href="/partner-us/commissions" className="btn btn-outline">My commissions</Link>}
      </PageHero>

      <Section id="apply" title="Choose what kind of partner you are" fil="Piliin ang uri ng partner" className="scroll-mt-24">
        {!user && (
          <div className="card mb-5 space-y-3 border-2 border-flame p-5">
            <p className="text-[15px] leading-6"><strong>The application is for FLAME PH members.</strong> Sign up for free or log in, then come back here to start.</p>
            <p className="text-sm text-muted" lang="fil">Mag-sign up nang libre o mag-log in para makapag-apply.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/join?next=%2Fpartner-us%23apply" className="btn btn-flame w-full sm:w-auto">Sign up free</Link>
              <Link href="/login?next=%2Fpartner-us%23apply" className="btn btn-outline w-full sm:w-auto">Log in</Link>
            </div>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {CATEGORY_KEYS.map((k) => {
            const c = PARTNER_CATEGORIES[k];
            const app = byCat.get(k);
            return (
              <article key={k} className="card flex flex-col p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-flame-strong">{c.stage}</p>
                <h3 className="mt-1 text-xl font-extrabold text-primary">{c.label}</h3>
                <p className="text-sm font-semibold text-muted" lang="fil">{c.fil}</p>
                <p className="mt-2 flex-1 text-[15px] leading-6 text-muted">{c.text}</p>
                <details className="mt-3 rounded-xl border border-line px-3 py-1">
                  <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Documents to prepare</summary>
                  <ul className="list-disc space-y-1 pb-3 pl-5 text-sm text-muted">
                    {requiredDocs(k, { regulated: "Yes", licensed: "Yes" }).map((t) => (
                      <li key={t}>{PARTNER_DOC_TYPES[t].label}{(t === "fda" && k === "supplier") || t === "prc" ? " (if your products or work need it)" : ""}</li>
                    ))}
                  </ul>
                </details>
                <div className="mt-4">
                  {!user ? null : app ? (
                    <>
                      <p className="mb-2 text-sm">Your application: <strong>{STATUS[app.status].label}</strong></p>
                      <Link href={`/partner-us/apply/${app.id}`} className="btn btn-primary min-h-11 w-full">{app.status === "draft" || app.status === "needs_changes" ? "Continue" : "Open"}</Link>
                      {k === "supplier" && app.status === "approved" && <Link href="/partner-us/offers" className="btn btn-flame mt-2 min-h-11 w-full">Send a Best Offer</Link>}
                    </>
                  ) : (
                    <form action={startApplication}>
                      <input type="hidden" name="category" value={k} />
                      <SubmitButton className="btn btn-flame min-h-11 w-full" pendingText="Starting…">Apply as {c.label.toLowerCase()}</SubmitButton>
                    </form>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="How it works" fil="Paano ito gumagana" className="pt-0 lg:pt-0">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map((s, i) => (
            <li key={s.t} className="card p-5">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary font-extrabold text-primary-fg">{i + 1}</span>
              <h3 className="mt-3 font-extrabold">{s.t}</h3>
              <p className="mt-1 text-[15px] leading-6 text-muted">{s.d}</p>
              <p className="mt-1 text-sm text-muted" lang="fil">{s.tl}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="font-extrabold text-primary">After you are accredited</h3>
            <p className="mt-2 text-[15px] leading-6 text-muted">Suppliers go first: send your Best Offer (prices, minimum orders, delivery areas) for the national team to compare. Service providers and toll manufacturers follow. We will tell you when your form opens.</p>
            <p className="mt-2 text-sm text-muted">Commission figures in an offer are proposals only. No money passes through flameph.org; MarketplacePH Online Store handles any payment.</p>
          </div>
          <div className="card p-5">
            <h3 className="font-extrabold text-primary">Your privacy</h3>
            <p className="mt-2 text-[15px] leading-6 text-muted">Your TIN and documents are encrypted and never shown in public. Only the national review team can open them, and every view is logged.</p>
          </div>
        </div>
      </Section>

      <Section className="pt-0 lg:pt-0">
        <Faq items={FAQ} title="Questions about partner accreditation" />
        <p className="mt-6 text-sm text-muted">Representing an LGU, school, company, NGO or foundation? <Link href="/partners" className="font-semibold text-primary underline">Go to Partner With Us</Link>.</p>
      </Section>
    </>
  );
}
