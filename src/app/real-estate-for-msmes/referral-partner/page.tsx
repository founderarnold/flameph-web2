import Link from "next/link";
import { RealEstateDisclaimer } from "@/components/real-estate/RealEstateDisclaimer";
import { RealEstateNav } from "@/components/real-estate/RealEstateNav";
import { SubmissionForm } from "@/components/SubmissionForm";
import { PageHero, Section } from "@/components/ui";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Property Referral Partner", "Apply for orientation about approved property referral opportunities through Mapiles Realty Corporate H.", "/real-estate-for-msmes/referral-partner");

export default function ReferralPartnerPage() {
  return (
    <>
      <RealEstateNav />
      <PageHero fil="Referral / affiliate pathway" title="Explore Property Referral Opportunities" path="/real-estate-for-msmes/referral-partner"
        intro="If someone in your network needs property, you may apply for orientation about the approved Corporate H referral pathway. Application is not automatic approval." />
      <Section title="What a referral partner can—and cannot—do">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card border-ok p-6"><h3 className="text-xl font-extrabold text-ok">Appropriate activities</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-muted"><li>Identify a person who has a real property requirement.</li><li>Ask for permission before sharing contact details.</li><li>Submit accurate information through the approved channel.</li><li>Let authorized professionals handle regulated activity.</li></ul></div>
          <div className="card border-flame p-6"><h3 className="text-xl font-extrabold text-flame-strong">Not automatically authorized</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-muted"><li>Do not represent yourself as a broker, agent, or accredited salesperson.</li><li>Do not promise price, returns, approval, availability, or income.</li><li>Do not collect confidential client data without consent.</li><li>Do not negotiate or perform regulated acts without proper authority.</li></ul></div>
        </div>
      </Section>
      <Section title="Referral pathway" intro="Orientation, review, and approval come before active participation.">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {["Apply", "Attend orientation", "Complete requirements", "Receive approval if qualified", "Submit consented referrals"].map((step, index) => <li key={step} className="card p-4 text-center"><span className="font-extrabold text-primary">{index + 1}</span><p className="mt-2 font-bold">{step}</p></li>)}
        </ol>
      </Section>
      <Section id="apply" className="!pt-0"><div className="mx-auto max-w-3xl"><SubmissionForm def={FORMS["real-estate-referral-partner"]} context={{ source: "Real Estate for MSMEs — Referral" }} /></div></Section>
      <Section className="!pt-0"><RealEstateDisclaimer /><p className="mt-6 text-center"><Link className="font-bold text-primary underline" href="/real-estate-for-msmes/careers">Looking for a professional career instead?</Link></p></Section>
    </>
  );
}
