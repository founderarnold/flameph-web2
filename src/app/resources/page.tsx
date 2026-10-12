import Link from "next/link";
import { PageHero, Section, EmptyState, VerifyWithAgency } from "@/components/ui";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";
import { OFFICIAL_LINKS } from "@/lib/site";

export const metadata = meta("Resources", "Guides, templates and checklists for Filipino MSMEs, with official agency links.", "/resources");

export type Resource = { id: string; title: string; slug: string; summary: string | null; type: string; stage: string | null; topic: string | null; last_reviewed: string | null };
const STAGES = ["discover", "start", "build", "grow", "scale"];

export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string; topic?: string; q?: string }> }) {
  const sp = await searchParams;
  const all = await list<Resource>({ table: "resources", select: "id,title,slug,summary,type,stage,topic,last_reviewed", order: "last_reviewed" });
  const topics = [...new Set(all.map((r) => r.topic).filter(Boolean))] as string[];
  const q = (sp.q || "").toLowerCase();
  const rows = all.filter((r) => (!sp.stage || r.stage === sp.stage) && (!sp.topic || r.topic === sp.topic) && (!q || `${r.title} ${r.summary}`.toLowerCase().includes(q)));
  return (
    <>
      <PageHero status="live" fil="Matuto" title="Resources" path="/resources" intro="Free guides, templates and checklists. Each one shows when it was last reviewed and links to the official agency." />
      <Section>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
          <label className="sr-only" htmlFor="rq">Search</label>
          <input id="rq" name="q" defaultValue={sp.q} placeholder="Search guides…" className="input" />
          <select name="stage" defaultValue={sp.stage ?? ""} className="input" aria-label="Stage">
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select name="topic" defaultValue={sp.topic ?? ""} className="input" aria-label="Topic">
            <option value="">All topics</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            {sp.topic && !topics.includes(sp.topic) && <option value={sp.topic}>{sp.topic}</option>}
          </select>
          <button className="btn btn-primary">Filter</button>
        </form>
        <div className="mt-6">
          {rows.length === 0 ? (
            <EmptyState title={all.length ? "Walang tugma sa filter mo." : "Inihahanda pa ang unang mga gabay."} text={all.length ? "Try another stage or topic." : "Our first guides are being reviewed. Meanwhile, Ka-FLAME AI can answer your questions."} cta={all.length ? { href: "/resources", label: "Clear filters" } : { href: "/bizconsult-ai", label: "Ask Ka-FLAME AI" }} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/resources/${r.slug}`} className="card block h-full p-5 hover:border-primary">
                    <p className="text-xs font-bold uppercase text-flame-strong">{r.type}{r.stage ? ` · ${r.stage}` : ""}{r.topic ? ` · ${r.topic}` : ""}</p>
                    <h2 className="mt-1 text-lg font-bold">{r.title}</h2>
                    {r.summary && <p className="mt-1 text-[15px] text-muted">{r.summary}</p>}
                    {r.last_reviewed && <p className="mt-2 text-xs text-muted">Last reviewed {new Date(r.last_reviewed).toLocaleDateString("en-PH", { dateStyle: "medium" })}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-8"><VerifyWithAgency agencies={[{ name: "BIR", url: OFFICIAL_LINKS.BIR }, { name: "DTI", url: OFFICIAL_LINKS.DTI }, { name: "SEC", url: OFFICIAL_LINKS.SEC }, { name: "FDA", url: OFFICIAL_LINKS.FDA }, { name: "your LGU", url: "https://www.dilg.gov.ph" }]} /></div>
      </Section>
    </>
  );
}
