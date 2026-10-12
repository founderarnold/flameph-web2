import Link from "next/link";
import { PageHero, Section, Grid, Notice } from "@/components/ui";
import { meta } from "@/lib/meta";
import { MISSION, ORG, PILLARS, PURPOSE, TAGLINES, TRUST_LINE, VISION } from "@/lib/site";

export const metadata = meta("What is FLAME PH", "FLAME PH, the Federation of Leaders Advancing MSME Ecosystem in the Philippines: history, purpose, vision, mission, pillars and SEC registration.", "/about");

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Tungkol sa amin" title="What is FLAME PH" path="/about" intro={PURPOSE} />
      <Section>
        <p className="rounded-xl bg-primary-soft px-4 py-3 font-semibold text-primary">{TRUST_LINE}</p>
      </Section>
      <Section title="Our story" className="!pt-0">
        <div className="max-w-3xl space-y-3 text-[17px]">
          <p>FLAME PH began as <strong>{ORG.formerName}</strong>, registered with the Securities and Exchange Commission on {ORG.secRegisteredOn} as a {ORG.type.toLowerCase()}.</p>
          <p>Today it carries the name <strong>{ORG.name}</strong>. It was founded by practicing Filipino entrepreneurs who believe that {TAGLINES.noOneAlone.toLowerCase().replace(/\.$/, "")}.</p>
          <p className="font-display text-xl font-bold text-flame-strong">{TAGLINES.main}</p>
        </div>
      </Section>
      <Section>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-6"><h2 className="text-xl font-extrabold text-primary">Vision</h2><p className="mt-2">{VISION}</p></div>
          <div className="card p-6"><h2 className="text-xl font-extrabold text-primary">Mission</h2><p className="mt-2">{MISSION}</p></div>
        </div>
      </Section>
      <Section title="The 4 pillars" intro="How we plan to work. These describe our programs and plans, not results already achieved.">
        <Grid cols={4}>
          {PILLARS.map((p) => (
            <div key={p.name} className="card p-5">
              <p className="font-display text-sm font-bold text-flame-strong">{p.fil}</p>
              <h3 className="text-xl font-extrabold">{p.name}</h3>
              <p className="mt-1 text-[15px] text-muted">{p.text}</p>
            </div>
          ))}
        </Grid>
      </Section>
      <Section title="SEC registration">
        <div className="card max-w-xl border-primary p-6">
          <dl className="space-y-2">
            <div><dt className="text-sm text-muted">Registered name</dt><dd className="font-bold">{ORG.formerName}</dd></div>
            <div><dt className="text-sm text-muted">Now known as</dt><dd className="font-bold">{ORG.name}</dd></div>
            <div><dt className="text-sm text-muted">SEC Registration No.</dt><dd className="font-bold">{ORG.secNo}</dd></div>
            <div><dt className="text-sm text-muted">Date registered</dt><dd className="font-bold">{ORG.secRegisteredOn}</dd></div>
            <div><dt className="text-sm text-muted">Type</dt><dd className="font-bold">{ORG.type}</dd></div>
            <div><dt className="text-sm text-muted">Headquarters</dt><dd className="font-bold">{ORG.address}</dd></div>
            <div><dt className="text-sm text-muted">Email</dt><dd><a className="font-bold underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a> · <a className="underline" href={`mailto:${ORG.emailPartnerships}`}>{ORG.emailPartnerships}</a> (partnerships)</dd></div>
          </dl>
        </div>
      </Section>
      <Section title="Transparency" id="transparency">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5"><h3 className="text-lg font-bold">How we are governed</h3><p className="mt-1 text-[15px] text-muted">FLAME PH is a non-stock, non-profit corporation led by its founders and officers listed on our <Link className="underline" href="/about/founders">founders page</Link>. Partners are named publicly only when a signed agreement is on file.</p></div>
          <div className="card p-5"><h3 className="text-lg font-bold">How we protect member data</h3><p className="mt-1 text-[15px] text-muted">We follow the Data Privacy Act of 2012 (RA 10173). We collect only what we need, never sell personal data, and never send other members&apos; data to our AI assistant. Read the <Link className="underline" href="/legal/privacy">Privacy Notice</Link>.</p></div>
          <div className="card p-5"><h3 className="text-lg font-bold">How we count statistics</h3><p className="mt-1 text-[15px] text-muted">Every number on this website is counted automatically from our database: members with a verified email, published listings, recorded event attendance. Nothing is typed in by hand. See <Link className="underline" href="/impact">Impact</Link>.</p></div>
        </div>
      </Section>
      <Section><Notice tone="info">FLAME PH is a private non-profit, not a government agency, and does not claim government endorsement.</Notice></Section>
    </>
  );
}
