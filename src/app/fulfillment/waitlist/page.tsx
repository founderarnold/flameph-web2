import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Micro Fulfillment Waitlist", "Join the waitlist for Micro Fulfillment by MSMEs, as an MSME brand owner or a fulfillment hub operator.", "/fulfillment/waitlist");

const BENEFITS = [
  {
    title: "For MSME brand owners", items: [
      "Reach customers across the country through a network of local hubs, instead of building your own warehouses.",
      "Aim for wide distribution at a fraction of the cost of going through big supermarkets and mini grocery chains.",
      "Your products are stored near customers, so delivery can be faster and cheaper.",
      "See your stock and orders in one dashboard.",
    ],
  },
  {
    title: "For fulfillment hub operators", items: [
      "Put your extra space, staff time or riders to work by serving other MSMEs.",
      "Earn service fees for storing, packing and delivering, under a clear written agreement.",
      "Get training, simple tools and steady partners from the FLAME PH network.",
      "Become a trusted local partner for brands in your city or town.",
    ],
  },
];

const FAQ = [
  { q: "What is Micro Fulfillment by MSMEs?", a: "Instead of building big warehouses everywhere, qualified local businesses (like stores, bodegas and small offices) act as small hubs. They store, pack and deliver products for other MSME brands in their area." },
  { q: "Is it already running?", a: "Not yet. We are starting with a small pilot using a few brand owners, hub operators and couriers. The waitlist helps us choose pilot areas and partners." },
  { q: "Does it cost anything to join the waitlist?", a: "No. Joining the waitlist is free and does not commit you to anything. Fees for brands and payouts for hubs will be explained in writing before anything starts." },
  { q: "Who can be a hub operator?", a: "Registered businesses with a safe, dry space, someone who can receive and pack items, and ideally a way to deliver or arrange pickups. Hubs are checked before they are accepted." },
  { q: "Who is responsible if products are lost or damaged?", a: "This will be set in the written agreement for each pilot, including stock checks, proof of handover and how claims are handled. Nothing starts without that agreement." },
  { q: "Does FLAME PH hold my money?", a: "Payments and payouts will follow the pilot agreement and go through licensed payment and courier partners. FLAME PH does not collect payments on this website." },
  { q: "Is my product allowed?", a: "Most packaged goods are welcome. Products that need refrigeration, special permits or careful handling may only be possible in some hubs. Tell us in the form." },
];

export default function Page() {
  return (
    <>
      <PageHero status="soon" fil="Sumali sa waitlist" title="Micro Fulfillment Waitlist" path="/fulfillment/waitlist"
        intro="Micro Fulfillment Hubs by MSMEs: local businesses helping other MSMEs store, pack and deliver orders across the Philippines. Join the waitlist as a brand owner, a hub operator, or both." />
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {BENEFITS.map((b) => (
            <div key={b.title} className="card p-5">
              <h2 className="text-lg font-extrabold text-primary">{b.title}</h2>
              <ul className="mt-3 space-y-2 text-[15px] leading-6">
                {b.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-flame" />{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="form" className="scroll-mt-24"><SubmissionForm def={FORMS["fulfillment-waitlist"]} /></div>
          <div><Faq items={FAQ} /></div>
        </div>
        <p className="mt-6 text-sm text-muted">More about the program: <Link href="/fulfillment" className="font-semibold text-primary underline">Fulfillment by MSMEs</Link>.</p>
      </Section>
    </>
  );
}
