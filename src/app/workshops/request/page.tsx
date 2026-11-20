import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Request a FLAME PH Workshop", "LGUs, national government agencies, NGOs and communities can request a free FLAME PH entrepreneurship workshop in their area.", "/workshops/request");

const STEPS = [
  { title: "1. Send the request", text: "Tell us who you are, who will attend, the topics you need and your preferred date." },
  { title: "2. Plan together", text: "Our workshop team calls you to agree on the date, venue, program and speakers." },
  { title: "3. Hold the workshop", text: "FLAME PH brings speakers and materials. You invite participants and host the venue." },
  { title: "4. Keep growing", text: "Participants can join FLAME PH and a local chapter for follow-up mentoring and group orders." },
];

const FAQ = [
  { q: "Who can request a workshop?", a: "City and municipal LGUs, barangays, provincial offices, national government agencies (NGAs), NGOs and foundations, schools, cooperatives, church and community groups, and companies with CSR programs." },
  { q: "How much does it cost?", a: "Sugpuin ang Kahirapan Through Entrepreneurship workshops are free. The host usually provides the venue and, if possible, snacks. Any other costs are agreed in writing before the date." },
  { q: "How many participants do we need?", a: "We suggest at least 20 participants. Large groups of 100 or more are possible with a bigger venue and sound system." },
  { q: "What topics are available?", a: "Starting small, budgeting and pricing, selling online and offline, bookkeeping basics, business registration, and AI Tools for Business. We can tailor topics to your community." },
  { q: "How early should we request?", a: "At least 3 weeks before your preferred date." },
  { q: "Can you help us start a FLAME PH chapter after the workshop?", a: "Yes. Many workshops end with an invitation to form a local chapter, so participants keep learning and supporting each other." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Magdala ng FLAME PH workshop sa inyong lugar" title="Request a FLAME PH Workshop" path="/workshops/request"
        intro="Conduct a FLAME PH entrepreneurship workshop in your community, in partnership with your LGU, national government agency (NGA) or NGO." />
      <Section title="How it works" intro="Four simple steps from request to a workshop in your community.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.title} className="card p-5">
              <h2 className="font-extrabold text-primary">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Request form" intro="Fill in what you know now. Our team will help with the rest.">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="form" className="scroll-mt-24"><SubmissionForm def={FORMS["workshop-request"]} title="Request to conduct a FLAME PH Workshop in our community" /></div>
          <div className="space-y-4">
            <Faq items={FAQ} />
            <p className="text-sm text-muted">See what past workshops looked like in the <Link href="/workshops/gallery" className="font-semibold text-primary underline">Workshop gallery</Link>.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
