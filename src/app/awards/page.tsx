import Link from "next/link";
import { PageHero, Section, Grid, FeatureCard, Notice } from "@/components/ui";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Annual Awards for MSMEs", "Recognizing Filipino MSMEs for resilience, innovation, job generation, and women-led and youth-led enterprise.", "/awards");

const CATS = [
  { title: "Resilience", text: "MSMEs that kept going and recovered through hard times." },
  { title: "Innovation", text: "New products, services or ways of working that solve real problems." },
  { title: "Job generation", text: "Businesses creating livelihoods in their communities." },
  { title: "Women-led", text: "Enterprises founded or led by women." },
  { title: "Youth-led", text: "Enterprises founded or led by young Filipinos." },
];

type Cycle = { id: string; year: number; title: string; nominations_open: boolean; opens_on: string | null; closes_on: string | null; ceremony_on: string | null; criteria: string | null };
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-PH", { dateStyle: "long" }) : "To be announced");

export default async function Page() {
  const cycles = await list<Cycle>({ table: "awards_cycles", order: "year", limit: 1 });
  const cycle = cycles[0];
  return (
    <>
      <PageHero status={cycle?.nominations_open ? "live" : "soon"} fil="Pagkilala sa galing ng MSME" title="Annual Awards for MSMEs" path="/awards"
        intro="An annual recognition for Filipino MSMEs. Categories are below; the timeline is announced when a cycle opens." />
      <Section title="Award categories"><Grid>{CATS.map((c) => <FeatureCard key={c.title} {...c} />)}</Grid></Section>
      <Section title={cycle ? cycle.title : "Timeline"}>
        {cycle ? (
          <div className="card p-5">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div><dt className="text-sm text-muted">Nominations open</dt><dd className="font-bold">{d(cycle.opens_on)}</dd></div>
              <div><dt className="text-sm text-muted">Nominations close</dt><dd className="font-bold">{d(cycle.closes_on)}</dd></div>
              <div><dt className="text-sm text-muted">Awarding</dt><dd className="font-bold">{d(cycle.ceremony_on)}</dd></div>
            </dl>
            {cycle.criteria && <p className="mt-4 whitespace-pre-line">{cycle.criteria}</p>}
          </div>
        ) : (
          <Notice>The first awards cycle has not opened yet. Criteria and dates will be posted here.</Notice>
        )}
        <p className="mt-6"><Link href="/get-involved/nominate" className="btn btn-primary">Nominate an MSME</Link></p>
      </Section>
    </>
  );
}
