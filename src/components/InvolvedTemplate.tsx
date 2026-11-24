import { PageHero, Section, Notice } from "./ui";
import { SubmissionForm } from "./SubmissionForm";
import { FORMS } from "@/lib/forms";
import type { InvolvedPage } from "@/content/involved";

/** How many example cards show before "Show all". Keeps long lists from pushing the form far down on phones. */
const FIRST_EXAMPLES = 6;

function ExampleCard({ item }: { item: string }) {
  const [name, example] = item.split(" — ");
  return (
    <li className="rounded-xl border border-line bg-card p-3">
      <p className="font-bold">{name}</p>
      {example && <p className="mt-0.5 text-[15px] text-muted">{example}</p>}
    </li>
  );
}

function ExampleList({ items }: { items: string[] }) {
  const first = items.slice(0, FIRST_EXAMPLES);
  const rest = items.slice(FIRST_EXAMPLES);
  return (
    <>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {first.map((i) => <ExampleCard key={i} item={i} />)}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-2">
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-1 font-semibold text-primary underline">
            <span className="group-open:hidden">Show all {items.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {rest.map((i) => <ExampleCard key={i} item={i} />)}
          </ul>
        </details>
      )}
    </>
  );
}

export function InvolvedTemplate({ page, children, defaults }: { page: InvolvedPage; children?: React.ReactNode; defaults?: Record<string, string> }) {
  const longPage = page.sections.some((s) => s.examples);
  return (
    <>
      <PageHero status={page.status} fil={page.fil} title={page.title} intro={page.intro} path={`/get-involved/${page.slug}`}>
        {longPage ? <a href="#form" className="btn btn-primary">Volunteer now</a> : null}
      </PageHero>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="min-w-0 space-y-6">
            {page.sections.map((s) => (
              <div key={s.title}>
                <h2 className="text-xl font-extrabold">{s.title}</h2>
                {s.intro && <p className="mt-1 text-muted">{s.intro}</p>}
                {s.examples ? <ExampleList items={s.items} /> : (
                  <ul className="mt-2 space-y-2">
                    {s.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-flame" />{i}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {page.note && <Notice>{page.note}</Notice>}
            {children}
          </div>
          <div id="form" className="min-w-0 scroll-mt-24"><SubmissionForm def={FORMS[page.form]} defaults={defaults} /></div>
        </div>
      </Section>
    </>
  );
}
