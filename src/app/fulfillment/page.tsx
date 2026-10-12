import { PageHero, Section, Grid, FeatureCard } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Fulfillment by MSMEs", "How member MSMEs can become fulfillment partners: producing, packing and delivering orders.", "/fulfillment");

export default function Page() {
  return (
    <>
      <PageHero status="soon" fil="Kita mula sa kapwa MSME" title="Fulfillment by MSMEs" path="/fulfillment"
        intro="A planned program where member MSMEs produce, pack or deliver orders for FLAME PH merch, Signature Brands and personalized requests, so more of the work stays with local businesses." />
      <Section title="Who can apply">
        <Grid>
          <FeatureCard title="Makers" text="Food, crafts, garments, printing and other producers." />
          <FeatureCard title="Packers" text="Businesses with packing space and experience." />
          <FeatureCard title="Local delivery" text="Riders and small couriers serving their city." />
        </Grid>
      </Section>
      <Section><div className="max-w-xl"><SubmissionForm def={FORMS.fulfillment} /></div></Section>
    </>
  );
}
