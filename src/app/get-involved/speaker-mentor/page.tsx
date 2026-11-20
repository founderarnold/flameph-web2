import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Volunteer as Resource Speaker/Mentor", "Join the FLAME PH waitlist of resource speakers and mentors for MSMEs in your area and industry.", "/get-involved/speaker-mentor");

const ROLES = [
  { title: "Resource speaker", text: "Give a 30 to 60 minute talk at a Sugpuin ang Kahirapan workshop, AI Tools for Business seminar or chapter meetup, in person or online." },
  { title: "Mentor", text: "Guide a few MSMEs over time: answer questions, review their pricing, plans or listings, and help them avoid costly mistakes." },
];

const FAQ = [
  { q: "Who can volunteer?", a: "Seasoned entrepreneurs, managers and professionals from any industry: food, retail, agriculture, finance, tax, legal, marketing, IT, logistics and more." },
  { q: "Why a waitlist?", a: "We match speakers and mentors to workshops and chapters by area and industry. You will be contacted when there is a good fit near you or online." },
  { q: "Is it paid?", a: "It is volunteer work. Hosts often provide meals and transport help. Any allowance is agreed before the event." },
  { q: "How much time does it take?", a: "You choose. Many give one talk every few months, or 1 to 2 hours a month of mentoring." },
  { q: "Can I promote my business or services?", a: "You may introduce yourself and your business briefly. Talks and mentoring should teach, not sell." },
  { q: "Will I be listed on the website?", a: "Only if you tick the box in the form and are approved." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Ibahagi ang iyong kaalaman" title="Volunteer as Resource Speaker/Mentor for MSMEs" path="/get-involved/speaker-mentor"
        intro="Help Filipino MSMEs grow faster by sharing what you have learned in your industry. Join the waitlist and we will match you with workshops and chapters in your area." />
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.title} className="card p-5">
              <h2 className="text-lg font-extrabold text-primary">{r.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{r.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="form" className="scroll-mt-24"><SubmissionForm def={FORMS["speaker-mentor-waitlist"]} /></div>
          <div className="space-y-4">
            <Faq items={FAQ} />
            <p className="text-sm text-muted">See past workshops in the <Link href="/workshops/gallery" className="font-semibold text-primary underline">Workshop gallery</Link>.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
