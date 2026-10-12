import { PageHero, Section } from "@/components/ui";
import { EventList } from "@/components/EventList";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { eventsByType } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Trainings & Webinars", "Short, practical skills sessions for entrepreneurs, online and in person.", "/trainings-webinars");

export default async function Page() {
  const { upcoming, past } = await eventsByType(["training","webinar"]);
  return (
    <>
      <PageHero status="live" fil="Dagdag-kaalaman, online o harapan" title="Trainings & Webinars" path="/trainings-webinars" intro="Short, practical skills sessions for entrepreneurs, online and in person." />
      <Section><EventList upcoming={upcoming} past={past} emptyCta={{ href: "#request", label: "Request a free workshop" }} /></Section>
      <Section id="request"><div className="max-w-xl"><SubmissionForm def={FORMS["workshop-request"]} /></div></Section>
    </>
  );
}
