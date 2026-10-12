import { PageHero, Section, Notice } from "@/components/ui";
import { StatusBadge, type Status } from "@/components/StatusBadge";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Get More MSME Benefits", "FLAME PH membership tiers. Paid tiers are coming soon; join the waitlist.", "/membership/more-benefits");

type Tier = { slug: string; sort: number; name: string; price_php: number | null; price_period: string | null; benefits: { label: string; status: Status }[]; available: boolean };
const FALLBACK = ["Free", "Starter", "Micro", "Neo", "Pro", "Champion"].map((name, i) => ({ slug: name.toLowerCase(), sort: i, name, price_php: null, price_period: null, benefits: [], available: i === 0 }));

export default async function Page() {
  const rows = await list<Tier>({ table: "tiers", order: "sort", ascending: true });
  const tiers: Tier[] = rows.length ? rows : FALLBACK;
  return (
    <>
      <PageHero status="soon" fil="Dagdag na benepisyo" title="Get More MSME Benefits" path="/membership/more-benefits"
        intro="Free membership is open now. Paid tiers are being designed, and we will only list benefits we can actually deliver." />
      <Section>
        <Notice>Paid tiers are not available yet, and no payments are collected on this website. Prices will appear here once the founders set them.</Notice>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.slug} className={`card p-5 ${t.available ? "border-primary" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold">{t.name}</h2>
                <StatusBadge status={t.available ? "live" : "soon"} />
              </div>
              <p className="mt-2 font-display text-2xl font-extrabold text-primary">
                {t.slug === "free" ? "Free" : t.price_php != null ? `₱${Number(t.price_php).toLocaleString("en-PH")}/${t.price_period ?? "month"}` : "Price to be announced"}
              </p>
              {t.benefits.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {t.benefits.map((b) => (
                    <li key={b.label} className="flex items-start justify-between gap-2 text-[15px]"><span>{b.label}</span><StatusBadge status={b.status} /></li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-muted">Benefits to be announced.</p>}
              {!t.available && <a href="#waitlist" className="btn btn-outline mt-5 w-full">Coming soon — join the waitlist</a>}
            </div>
          ))}
        </div>
      </Section>
      <Section id="waitlist"><div className="max-w-xl"><SubmissionForm def={FORMS["tier-waitlist"]} /></div></Section>
    </>
  );
}
