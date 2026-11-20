import { PageHero, Section } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { Faq } from "@/components/Faq";
import { FORMS } from "@/lib/forms";
import { meta } from "@/lib/meta";

export const metadata = meta("Manager/CEO Training Program", "Apprenticeship and management trainee program for future managers and CEOs, through Manager's Pizza and FLAME PH partners.", "/manager-ceo-training");

const TRACKS = [
  { title: "Apprenticeship", text: "Learn by doing inside an actual store: daily operations, customer service, inventory, cash handling and food safety." },
  { title: "Management trainee", text: "A longer path for future branch managers and business owners: people management, costing, sales planning and running a business unit." },
];

const FAQ = [
  { q: "Who can apply?", a: "Anyone 18 or older who wants to become a manager or run a business someday: students, fresh graduates, employees, OFWs and current business owners." },
  { q: "Do I need management experience?", a: "No. Tell us your work history, even part-time or family business work. We look at your attitude, reliability and willingness to learn." },
  { q: "Where does the training happen?", a: "Mainly through Manager's Pizza stores and FLAME PH partner companies. Locations depend on available slots, so tell us if you can train in another city." },
  { q: "Is there a fee? Is it paid?", a: "There is no fee to apply. Allowances, pay and schedules depend on the track and partner company, and will be explained in writing before you start." },
  { q: "What happens after I apply?", a: "The team reviews your application, may ask for documents, and invites qualified applicants to an interview." },
];

export default function Page() {
  return (
    <>
      <PageHero status="live" fil="Para sa mga susunod na manager at CEO" title="Manager/CEO Training Program" path="/manager-ceo-training"
        intro={<>Apprenticeship and management trainee program for future managers and CEOs, through <a href="https://www.managerspizza.com" target="_blank" rel="noopener" className="font-semibold text-primary underline">Manager&apos;s Pizza</a> and FLAME PH partners.</>}>
        <a href="#apply" className="btn btn-flame rounded-full">Apply now ↓</a>
      </PageHero>
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          {TRACKS.map((t) => (
            <div key={t.title} className="card p-5">
              <h2 className="text-lg font-extrabold text-primary">{t.title}</h2>
              <p className="mt-2 text-[15px] leading-6 text-muted">{t.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div id="apply" className="scroll-mt-24"><SubmissionForm def={FORMS["manager-trainee"]} /></div>
          <div><Faq items={FAQ} /></div>
        </div>
      </Section>
    </>
  );
}
