import Link from "next/link";
import { RealEstateDisclaimer } from "@/components/real-estate/RealEstateDisclaimer";
import { RealEstateNav } from "@/components/real-estate/RealEstateNav";
import { SubmissionForm } from "@/components/SubmissionForm";
import { PageHero, Section } from "@/components/ui";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Find Business Property", "Submit an MSME property or business-location requirement for review by the FLAME PH real-estate partner.", "/real-estate-for-msmes/find-property");

export default function FindPropertyPage() {
  return (
    <>
      <RealEstateNav />
      <PageHero fil="Property client pathway" title="What Kind of Property Do You Need?" path="/real-estate-for-msmes/find-property"
        intro="Tell us what you are looking for. FLAME PH can forward your consented requirement to an appropriate Mapiles Realty Corporate H property specialist for review." />
      <Section title="A simple, careful process" intro="Submitting an inquiry does not reserve a property or guarantee availability, financing, pricing, or transaction approval.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Share your requirement", "A specialist reviews it", "Appropriate options may be matched", "You decide whether to continue"].map((step, index) => (
            <li key={step} className="card p-5"><span className="grid h-9 w-9 place-items-center rounded-full bg-ok-soft font-extrabold text-ok">{index + 1}</span><p className="mt-3 font-bold">{step}</p></li>
          ))}
        </ol>
      </Section>
      <Section id="property-form" className="!pt-0">
        <div className="mx-auto max-w-3xl">
          <SubmissionForm def={FORMS["real-estate-property"]} context={{ source: "Real Estate for MSMEs" }} />
          <p className="mt-4 text-sm text-muted">Your contact details and budget are private. They are used only to review and respond to this inquiry and are not displayed publicly.</p>
        </div>
      </Section>
      <Section className="!pt-0"><RealEstateDisclaimer /><p className="mt-6 text-center"><Link className="font-bold text-primary underline" href="/real-estate-for-msmes">Return to Real Estate for MSMEs</Link></p></Section>
    </>
  );
}
