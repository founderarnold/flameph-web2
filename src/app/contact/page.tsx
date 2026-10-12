import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { ORG } from "@/lib/site";
import { meta } from "@/lib/meta";

export const metadata = meta("Contact", "Contact FLAME PH by email or through the contact form.", "/contact");

export default function Page() {
  return (
    <>
      <PageHero fil="Makipag-ugnayan" title="Contact" path="/contact" share={false} intro="We read every message. Email us or use the form." />
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <div className="card p-5"><h2 className="font-bold">General inquiries</h2><a className="text-lg text-mph underline" href={`mailto:${ORG.emailPrimary}`}>{ORG.emailPrimary}</a></div>
            <div className="card p-5"><h2 className="font-bold">Partnerships</h2><a className="text-lg text-mph underline" href={`mailto:${ORG.emailPartnerships}`}>{ORG.emailPartnerships}</a></div>
            <div className="card p-5"><h2 className="font-bold">Headquarters</h2><p>{ORG.address}</p></div>
          </div>
          <SubmissionForm def={FORMS.contact} />
        </div>
      </Section>
    </>
  );
}
