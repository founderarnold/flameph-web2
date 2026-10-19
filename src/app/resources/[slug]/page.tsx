import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHero, Section, Notice } from "@/components/ui";
import { list } from "@/lib/content";
import { Markdown } from "@/components/Markdown";
import { FlameAdSlot } from "@/components/FlameAdSlot";

type R = { id: string; title: string; slug: string; summary: string | null; body: string | null; type: string; stage: string | null; topic: string | null; file_path: string | null; external_url: string | null; last_reviewed: string | null; source_links: { label: string; url: string }[] };

async function get(slug: string) {
  return (await list<R>({ table: "resources", filters: { slug }, limit: 1 }))[0];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await get((await params).slug);
  return r ? { title: r.title, description: r.summary ?? undefined, alternates: { canonical: `/resources/${r.slug}` } } : { title: "Resource not found" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const r = await get((await params).slug);
  if (!r) notFound();
  return (
    <>
      <PageHero title={r.title} intro={r.summary} path={`/resources/${r.slug}`} fil={[r.type, r.stage, r.topic].filter(Boolean).join(" · ")} />
      <div className="container-x pt-6"><FlameAdSlot slot="ARTICLE_INLINE" category={r.topic?.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "msme-resources"} /></div>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <article className="prose-flame max-w-none">{r.body ? <Markdown text={r.body} /> : null}</article>
          <aside className="space-y-4">
            {(r.file_path || r.external_url) && <a href={`/api/resources/${r.id}/download`} className="btn btn-primary w-full">Download / open</a>}
            {r.last_reviewed && <p className="text-sm text-muted">Last reviewed {new Date(r.last_reviewed).toLocaleDateString("en-PH", { dateStyle: "long" })}</p>}
            {r.source_links?.length > 0 && (
              <div className="card p-4">
                <h2 className="font-bold">Official sources</h2>
                <ul className="mt-2 space-y-1">{r.source_links.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener" className="text-mph underline">{s.label} ↗</a></li>)}</ul>
              </div>
            )}
            <Notice tone="info">Laws, fees and requirements change. Paki-verify sa BIR, DTI, SEC, FDA o inyong LGU bago mag-decide.</Notice>
          </aside>
        </div>
      </Section>
    </>
  );
}
