import { PageHero, Section } from "@/components/ui";
import { EventList } from "@/components/EventList";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { eventsByType } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Expos & Summits", "Events where MSMEs can exhibit products, meet buyers and learn from each other.", "/expos-summits");

export default async function Page() {
  const { upcoming, past } = await eventsByType(["expo","summit"]);
  return (
    <>
      <PageHero status="live" fil="Ipakita ang produkto mo" title="Expos & Summits" path="/expos-summits" intro="Events where MSMEs can exhibit products, meet buyers and learn from each other." />
      <Section><EventList upcoming={upcoming} past={past} emptyCta={{ href: "#request", label: "Request a free workshop" }} /></Section>
      <Section id="request"><div className="max-w-xl"><SubmissionForm def={FORMS["exhibitor"]} /></div></Section>
    </>
  );
}
