import { PageHero, Section, Notice } from "./ui";
import { getSettings } from "@/lib/settings";

export async function LegalPage({ k, title, path, updated, children }: { k: "terms" | "privacy" | "membership"; title: string; path: string; updated: string; children: React.ReactNode }) {
  const s = await getSettings();
  const approved = s.legal_status?.[k] === "approved";
  return (
    <>
      <PageHero title={title} path={path} share={false} intro={`Last updated ${updated}`} />
      <Section>
        {!approved && <div className="mb-6"><Notice>Draft — for review by counsel. This document has not yet been approved by FLAME PH&apos;s founders.</Notice></div>}
        <article className="prose-flame max-w-3xl">{children}</article>
      </Section>
    </>
  );
}
