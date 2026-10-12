import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Personalized by FLAMEPH", "Custom and personalized products made by FLAME PH member MSMEs. Send a request.", "/personalized");

export default function Page() {
  return (
    <>
      <PageHero status="soon" fil="Ginawa para sa iyo" title="Personalized by FLAMEPH" path="/personalized"
        intro="A planned service connecting you with member MSMEs who make custom tokens, giveaways, packaging and personalized products. Send a request and we'll get back to you once it opens." />
      <Section><div className="max-w-xl"><SubmissionForm def={FORMS.personalized} /></div></Section>
    </>
  );
}
