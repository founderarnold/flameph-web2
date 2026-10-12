import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import * as I from "@/components/icons";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Volunteering", "Volunteer with FLAME PH as a mentor, resource speaker, professional or chapter leader.", "/volunteering");

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Mag-volunteer" title="Volunteering" path="/volunteering" intro="Share your time and skills with Filipino entrepreneurs. Pick the role that fits you." />
      <Section>
        <Grid cols={2}>
          <FeatureCard title="Volunteer as Mentor" text="Guide MSMEs one-on-one or in small groups." href="/get-involved/mentor" icon={<I.IconUsers />} />
          <FeatureCard title="Volunteer as a Resource Speaker" text="Teach a topic at a workshop, training or webinar." href="/get-involved/resource-speaker" icon={<I.IconMic />} />
          <FeatureCard title="Volunteer Professional Services" text="Offer web, social media, tax, bookkeeping, accounting or advertising help." href="/get-involved/professional-services" icon={<I.IconHands />} />
          <FeatureCard title="Become a Chapter Leader" text="Start and lead a FLAME PH chapter in your city or municipality." href="/get-involved/chapter-leader" icon={<I.IconMap />} />
        </Grid>
      </Section>
      <Section title="Not sure yet?"><div className="max-w-xl"><SubmissionForm def={FORMS.volunteer} /></div></Section>
    </>
  );
}
