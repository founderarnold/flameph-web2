import { PageHero, Section } from "@/components/ui";
import { EventList } from "@/components/EventList";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { eventsByType } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Educational Workshops", "Hands-on workshops for MSMEs, aspiring entrepreneurs, LGUs, barangays and schools.", "/workshops");

export default async function Page() {
  const { upcoming, past } = await eventsByType(["workshop"]);
  return (
    <>
      <PageHero status="live" fil="Mga workshop para sa komunidad" title="Educational Workshops" path="/workshops" intro="Hands-on workshops for MSMEs, aspiring entrepreneurs, LGUs, barangays and schools." />
      <Section><EventList upcoming={upcoming} past={past} emptyCta={{ href: "#request", label: "Request a free workshop" }} /></Section>
      <Section id="request"><div className="max-w-xl"><SubmissionForm def={FORMS["workshop-request"]} /></div></Section>
    </>
  );
}
