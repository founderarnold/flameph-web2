import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Join as Partner or Sponsor a Workshop", "LGUs, agencies, companies, schools and NGOs can partner with FLAME PH or sponsor a free entrepreneurship workshop.", "/get-involved/workshop-partner");

const WAYS = [
  { title: "Co-host", text: "Provide a venue and invite participants from your community. FLAME PH brings speakers and materials." },
  { title: "Sponsor", text: "Fund a workshop's food, materials or transport so participants can attend for free." },
  { title: "In-kind support", text: "Give starter kits, printing, prizes, equipment or your team's time as trainers." },
  { title: "Program partner", text: "Run a series of workshops with us for a town, sector or group, such as women, youth or OFW families." },
];

const FAQ = [
  { q: "Who can partner or sponsor?", a: "LGUs, national government agencies, companies and CSR programs, banks, schools, NGOs, foundations, cooperatives and media." },
  { q: "Is joining the waitlist a commitment?", a: "No. It tells us you are interested. Our partnerships team will call you to discuss what fits before anything is agreed." },
  { q: "How is sponsorship money handled?", a: "Every sponsorship is agreed in writing, with what it covers and how it is reported. Sponsors get attendance records and real photos." },
  { q: "Will our organization be recognized?", a: "Yes, with your approval: on the workshop materials and in the Workshop gallery. Partners are listed on the website only after a signed agreement." },
  { q: "Can we choose the location and audience?", a: "Yes. Tell us the area and group you want to help, and we will plan the workshop around them." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Makipag-partner o mag-sponsor" title="Join as Partner or Sponsor a Workshop" path="/get-involved/workshop-partner"
        intro="Help bring free Sugpuin ang Kahirapan Through Entrepreneurship workshops to more communities. Join the partner and sponsor waitlist and we will plan the right support with you." />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WAYS.map((w) => (
            <div key={w.title} className="card p-5">
              <h2 className="text-lg font-extrabold text-primary">{w.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{w.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="form" className="scroll-mt-24"><SubmissionForm def={FORMS["workshop-partner"]} /></div>
          <div className="space-y-4">
            <Faq items={FAQ} />
            <p className="text-sm text-muted">Already have a date and venue? <Link href="/workshops/request" className="font-semibold text-primary underline">Request a workshop</Link> instead.</p>
          </div>
        </div>
      </Section>
    </>
  );
}
