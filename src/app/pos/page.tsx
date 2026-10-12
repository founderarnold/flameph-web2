import { PageHero, Section, Grid, FeatureCard, Notice } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Free POS for MSMEs", "A planned free point-of-sale app for small Filipino businesses. Join the waitlist.", "/pos");

export default function Page() {
  return (
    <>
      <PageHero status="soon" fil="Libreng POS" title="Free POS for MSMEs" path="/pos" intro="We are planning a simple, free point-of-sale for sari-sari stores, carinderias and small shops." />
      <Section title="What we plan for it to do">
        <Notice>This is a plan, not a finished product. Features may change before launch.</Notice>
        <div className="mt-4"><Grid>
          <FeatureCard title="Record sales on your phone" text="Tap to record sales, even with weak signal." status="soon" />
          <FeatureCard title="Track stock" text="Know what's running low before it runs out." status="soon" />
          <FeatureCard title="Daily summary" text="See today's sales and expenses at a glance." status="soon" />
        </Grid></div>
      </Section>
      <Section><div className="max-w-xl"><SubmissionForm def={FORMS["pos-waitlist"]} /></div></Section>
    </>
  );
}
