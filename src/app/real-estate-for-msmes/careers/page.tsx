import Link from "next/link";
import { RealEstateDisclaimer } from "@/components/real-estate/RealEstateDisclaimer";
import { RealEstateNav } from "@/components/real-estate/RealEstateNav";
import { SubmissionForm } from "@/components/SubmissionForm";
import { PageHero, Section } from "@/components/ui";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Corporate H Real Estate Careers", "Explore property marketing, professional sales, leadership, training and appropriate accreditation pathways with Mapiles Realty Corporate H.", "/real-estate-for-msmes/careers");

const ROLES = [
  ["Marketing Associate", "Develop property marketing, lead-generation and communication skills within approved guidelines."],
  ["Sales Associate", "Explore a structured sales-development pathway with appropriate supervision and training."],
  ["Real Estate Salesperson Pathway", "Learn about the requirements for accreditation under a supervising PRC-licensed real estate broker."],
  ["Sales Manager", "For qualified sales leaders interested in coaching and developing a compliant team."],
  ["Licensed Broker Opportunity", "For verified PRC-licensed real estate brokers exploring an appropriate professional opportunity."],
];

export default function CareersPage() {
  return (
    <>
      <RealEstateNav />
      <PageHero fil="Professional pathway" title="Build a Professional Path in Real Estate" path="/real-estate-for-msmes/careers"
        intro="Develop property knowledge, sales capability, marketing skills, professional network and leadership potential through the appropriate Mapiles Realty Corporate H pathway." />
      <Section title="Professional pathways" intro="These are separate roles. Company approval does not automatically complete accreditation, licensing, appointment, contract, or regulatory requirements.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{ROLES.map(([title, text]) => <article key={title} className="card p-5"><h3 className="font-extrabold text-primary">{title}</h3><p className="mt-2 text-sm text-muted">{text}</p></article>)}</div>
      </Section>
      <Section title="What happens after applying">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {["Initial screening", "Interview or orientation if required", "Training and document verification", "Appropriate agreement and accreditation before activation"].map((step, index) => <li key={step} className="card p-4"><span className="font-extrabold text-flame-strong">Step {index + 1}</span><p className="mt-2 font-bold">{step}</p></li>)}
        </ol>
      </Section>
      <Section id="apply" className="!pt-0"><div className="mx-auto max-w-3xl"><SubmissionForm def={FORMS["real-estate-career"]} context={{ source: "Real Estate for MSMEs — Careers" }} /></div></Section>
      <Section className="!pt-0"><RealEstateDisclaimer /><p className="mt-6 text-center"><span className="text-muted">Need property instead? </span><Link className="font-bold text-primary underline" href="/real-estate-for-msmes/find-property">Submit a property requirement</Link></p></Section>
    </>
  );
}
