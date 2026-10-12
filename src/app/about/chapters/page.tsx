import { PageHero, Section, EmptyState } from "@/components/ui";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";
import type { Chapter } from "@/app/chapters/page";

export const metadata = meta("Featured Chapters", "Featured FLAME PH chapters.", "/about/chapters");

export default async function Page() {
  const rows = await list<Chapter>({ table: "chapters", filters: { featured: true }, order: "name", ascending: true });
  return (
    <>
      <PageHero status="live" fil="Mga tampok na chapter" title="Featured Chapters" path="/about/chapters" intro="Local FLAME PH chapters doing great work in their communities." />
      <Section>
        {rows.length === 0 ? <EmptyState title="Our first chapters are forming." text="Want to lead one in your city or municipality?" cta={{ href: "/get-involved/chapter-leader", label: "Become a chapter leader" }} /> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((c) => (
              <li key={c.id} className="card p-5">
                <h2 className="text-lg font-bold">{c.name}</h2>
                <p className="text-sm text-muted">{[c.city, c.province].filter(Boolean).join(", ")}</p>
                {c.leader_name && <p className="mt-2 text-sm">Leader: <b>{c.leader_name}</b></p>}
                {c.description && <p className="mt-2 text-[15px] text-muted">{c.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
