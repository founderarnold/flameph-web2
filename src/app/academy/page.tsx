import { PageHero, Section, EmptyState } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";
import { FlameAdSlot } from "@/components/FlameAdSlot";

export const metadata = meta("FLAME PH Academy", "Structured learning tracks for Filipino entrepreneurs, from first idea to scaling up.", "/academy");

const TRACKS = [
  { key: "discover", name: "Discover", text: "Testing an idea and knowing your customer." },
  { key: "start", name: "Start", text: "Registering, pricing and opening for business." },
  { key: "build", name: "Build", text: "Bookkeeping, cash flow and simple systems." },
  { key: "grow", name: "Grow", text: "Marketing, online selling and wholesale." },
  { key: "scale", name: "Scale", text: "Financing, compliance and new markets." },
];

type Course = { id: string; title: string; stage: string; summary: string | null; url: string | null };

export default async function Page() {
  const courses = await list<Course>({ table: "courses", order: "created_at", ascending: true });
  return (
    <>
      <PageHero status={courses.length ? "live" : "soon"} fil="Matuto ayon sa yugto ng negosyo mo" title="FLAME PH Academy" path="/academy"
        intro="Learning tracks organized by business stage. Courses appear here as soon as they are published." />
      <div className="container-x pt-6"><FlameAdSlot slot="ARTICLE_INLINE" category="business-education" /></div>
      <Section title="Learning tracks">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {TRACKS.map((t) => {
            const items = courses.filter((c) => c.stage === t.key);
            return (
              <div key={t.key} className="card p-5">
                <h3 className="text-lg font-bold text-primary">{t.name}</h3>
                <p className="text-sm text-muted">{t.text}</p>
                {items.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {items.map((c) => <li key={c.id}>{c.url ? <a className="font-semibold text-mph underline" href={c.url}>{c.title}</a> : <span className="font-semibold">{c.title}</span>}</li>)}
                  </ul>
                ) : <p className="mt-3 text-sm font-semibold text-warn">Coming soon</p>}
              </div>
            );
          })}
        </div>
      </Section>
      <Section>
        {courses.length === 0 && <div className="mb-6"><EmptyState title="Wala pang published na course." text="Be the first to know when the first course opens." /></div>}
        <div className="max-w-xl"><SubmissionForm def={FORMS["academy-waitlist"]} /></div>
      </Section>
    </>
  );
}
