import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Join FLAME PH Workshops", "Join FLAME PH entrepreneurship workshops as a participant, speaker, mentor, or LGU and partner venue.", "/workshops/join");

const WAYS = [
  { title: "Participant", text: "Learn how to start small, price, sell and manage a business, and use simple AI tools. Free for Sugpuin ang Kahirapan workshops." },
  { title: "Speaker or mentor", text: "Professional experts and seasoned entrepreneurs from any industry share what they know and guide new entrepreneurs." },
  { title: "LGU or partner venue", text: "LGUs, agencies, schools, cooperatives and NGOs host a workshop and invite their community." },
];

const FAQ = [
  { q: "Is joining free?", a: "Yes. Signing up here is free. Sugpuin ang Kahirapan workshops are free for participants." },
  { q: "What happens after I send this form?", a: "Participants are told about the next workshop near them. Speakers and mentors get a short call about topics and schedule. LGU and venue partners are contacted to plan a date." },
  { q: "I represent an LGU and already have a date in mind. Which form should I use?", a: "Use the Request a workshop page. It asks for your preferred date, venue and audience so we can plan faster." },
  { q: "Will my details be shared?", a: "Only with the FLAME PH workshop team and, for a specific workshop, the hosting partner. See our Privacy Notice." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Sumali sa aming mga workshop" title="Join FLAME PH Workshops" path="/workshops/join"
        intro="Be part of Sugpuin ang Kahirapan Through Entrepreneurship: learn, teach, mentor or host. Tell us a little about yourself and why you want to join." />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="card p-5">
              <h2 className="text-lg font-extrabold text-primary">{w.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{w.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="form" className="scroll-mt-24"><SubmissionForm def={FORMS["workshop-join"]} /></div>
          <div className="space-y-4">
            <Faq items={FAQ} />
            <p className="text-sm text-muted">See photos from past workshops in the <Link href="/workshops/gallery" className="font-semibold text-primary underline">Workshop gallery</Link>, or <Link href="/workshops/request" className="font-semibold text-primary underline">request a workshop</Link> for your area.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
