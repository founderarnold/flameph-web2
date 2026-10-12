import { PageHero, Section, Notice } from "./ui";
import { SubmissionForm } from "./SubmissionForm";
import { FORMS } from "@/lib/forms";
import type { InvolvedPage } from "@/content/involved";

export function InvolvedTemplate({ page, children }: { page: InvolvedPage; children?: React.ReactNode }) {
  return (
    <>
      <PageHero status={page.status} fil={page.fil} title={page.title} intro={page.intro} path={`/get-involved/${page.slug}`} />
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            {page.sections.map((s) => (
              <div key={s.title}>
                <h2 className="text-xl font-extrabold">{s.title}</h2>
                <ul className="mt-2 space-y-2">
                  {s.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-flame" />{i}</li>)}
                </ul>
              </div>
            ))}
            {page.note && <Notice>{page.note}</Notice>}
            {children}
          </div>
          <div><SubmissionForm def={FORMS[page.form]} /></div>
        </div>
      </Section>
    </>
  );
}
