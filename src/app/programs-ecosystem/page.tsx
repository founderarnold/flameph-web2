import Link from "next/link";
import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import { meta } from "@/lib/meta";
import { SISTER_PLATFORMS } from "@/lib/site";

export const metadata = meta("Programs & MSME Ecosystem", "How FLAME PH, MarketplacePH, NegosyoDepot and Ka-FLAME AI fit together to help Filipino MSMEs start, grow and scale.", "/programs-ecosystem");

const CYCLE = ["Educate", "Connect", "Start Earning", "Build Business", "Create Jobs", "Scale Brands"];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Isang ecosystem para sa MSME" title="Programs & MSME Ecosystem" path="/programs-ecosystem"
        intro="FLAME PH is the community. Our sister platforms and Ka-FLAME AI are the tools. Together they form one path from first idea to growing brand." />
      <Section title="How the pieces fit">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="card border-primary p-5">
            <p className="text-sm font-bold uppercase text-primary">Community</p>
            <h3 className="text-xl font-bold">FLAME PH</h3>
            <p className="mt-1 text-muted">Membership, chapters, workshops, mentors, resources, advocacy and the free business directory.</p>
          </div>
          <div aria-hidden className="text-center text-3xl text-muted lg:rotate-0">⇄</div>
          <div className="grid gap-3">
            <div className="card p-4"><h3 className="font-bold">Ka-FLAME AI <span className="text-sm font-semibold text-primary">(Beta)</span></h3><p className="text-sm text-muted">Business Q&A and listing writer, inside this website.</p></div>
            <a href={SISTER_PLATFORMS.marketplaceph.url} target="_blank" rel="noopener" className="card block p-4 hover:border-mph"><h3 className="font-bold">MarketplacePH ↗</h3><p className="text-sm text-muted">{SISTER_PLATFORMS.marketplaceph.label}: where members can sell products and post jobs.</p></a>
            <a href={SISTER_PLATFORMS.negosyodepot.url} target="_blank" rel="noopener" className="card block p-4 hover:border-mph"><h3 className="font-bold">NegosyoDepot ↗ <span className="text-sm font-semibold text-warn">(Coming soon)</span></h3><p className="text-sm text-muted">{SISTER_PLATFORMS.negosyodepot.label}: business starter resources.</p></a>
          </div>
        </div>
      </Section>
      <Section title="The 6-step growth cycle" intro="This is the model we are building toward. It describes the path we want members to take, not results already achieved.">
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CYCLE.map((c, i) => (
            <li key={c} className="card p-4 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-flame-strong font-extrabold text-white">{i + 1}</span>
              <span className="mt-2 block font-bold">{c}</span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Our programs">
        <Grid>
          <FeatureCard title="FLAME PH Academy" text="Learning tracks by business stage." status="soon" href="/academy" />
          <FeatureCard title="NegosyoTalks" text="Talks and conversations with Filipino entrepreneurs." status="soon" href="/negosyo-talks" />
          <FeatureCard title="Educational Workshops" text="Hands-on workshops with LGUs, barangays and schools." status="live" href="/workshops" />
          <FeatureCard title="Trainings & Webinars" text="Short skills sessions, online and in person." status="live" href="/trainings-webinars" />
          <FeatureCard title="Expos & Summits" text="Events where MSMEs can exhibit and meet buyers." status="live" href="/expos-summits" />
          <FeatureCard title="Annual Awards for MSMEs" text="Recognizing resilient and innovative MSMEs." status="soon" href="/awards" />
        </Grid>
        <p className="mt-6"><Link href="/join" className="btn btn-flame">Join free</Link></p>
      </Section>
    </>
  );
}
