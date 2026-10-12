import Link from "next/link";
import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";
import { TAGLINES } from "@/lib/site";

export const metadata = meta("Advocacy", "Sugpuin ang Kahirapan through Entrepreneurship: FLAME PH's poverty alleviation advocacy and what we stand for.", "/advocacy");

type Pos = { id: string; title: string; body: string; approved_by: string | null };

export default async function Page() {
  const positions = await list<Pos>({ table: "policy_positions", order: "created_at" });
  return (
    <>
      <PageHero status="live" fil="Adbokasiya" title={TAGLINES.advocacy} path="/advocacy"
        intro="A poverty alleviation advocacy movement of FLAME PH. We believe a growing small business is one of the surest ways for a Filipino family to rise out of poverty.">
        <Link href="/get-involved/poverty-alleviation" className="btn btn-flame">Support the movement</Link>
      </PageHero>
      <Section title="What FLAME PH stands for">
        <Grid>
          <FeatureCard title="MSME rights" text="Small businesses deserve a fair voice when rules, fees and programs that affect them are made." />
          <FeatureCard title="Fair access" text="Access to training, markets, financing information and support should not depend on who you know or where you live." />
          <FeatureCard title="Digital inclusion" text="Every MSME, including those on a basic phone and prepaid data, should be able to use digital tools to grow." />
          <FeatureCard title="Fair trade, fewer middlemen" text="We support peer-to-peer commerce that lets producers keep more of what they earn." />
          <FeatureCard title="Grassroots leadership" text="Local chapters led by local entrepreneurs know their communities best." />
          <FeatureCard title="Collaboration" text={TAGLINES.principle} />
        </Grid>
      </Section>
      <Section title="Policy positions" intro="Formal positions are published here only after approval by the FLAME PH board.">
        {positions.length === 0 ? (
          <p className="text-muted">No formal policy positions have been published yet.</p>
        ) : (
          <div className="space-y-4">
            {positions.map((p) => (
              <article key={p.id} className="card p-5">
                <h3 className="text-lg font-bold">{p.title}</h3>
                <div className="prose-flame"><Markdown text={p.body} /></div>
                {p.approved_by && <p className="text-sm text-muted">Approved by {p.approved_by}</p>}
              </article>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
