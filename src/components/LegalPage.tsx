import Link from "next/link";
import { PageHero, Section } from "./ui";
import { POLICY_EFFECTIVE, POLICY_EFFECTIVE_LABEL, POLICY_PAGES, POLICY_VERSION } from "@/lib/policy";

/** A live policy page: version and effective date at the top, links to the other two policies at the bottom. */
export function LegalPage({ title, path, children }: { title: string; path: string; children: React.ReactNode }) {
  const others = Object.values(POLICY_PAGES).filter((p) => p.href !== path);
  return (
    <>
      <PageHero title={title} path={path} share={false} intro={<>Version {POLICY_VERSION} · Effective <time dateTime={POLICY_EFFECTIVE}>{POLICY_EFFECTIVE_LABEL}</time></>} />
      <Section>
        <article className="prose-flame max-w-3xl">{children}</article>
        <p className="mt-10 max-w-3xl border-t border-line pt-4 text-sm text-muted">
          Also read: {others.map((p, i) => <span key={p.href}>{i > 0 && " · "}<Link className="text-mph underline" href={p.href}>{p.title}</Link></span>)}
        </p>
      </Section>
    </>
  );
}

/** The fixed reminders (no-money, investor warning): shown as written, never hidden. */
export function FixedNotice({ children }: { children: React.ReactNode }) {
  return <div className="my-4 space-y-2 rounded-xl border-l-4 border-primary bg-primary-soft p-4 text-fg [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">{children}</div>;
}
