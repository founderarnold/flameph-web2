import Link from "next/link";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Chapters Near You", "Find a FLAME PH chapter in your region, province or city, or start one.", "/chapters");

export type Chapter = { id: string; name: string; region: string | null; province: string | null; city: string | null; leader_name: string | null; description: string | null; contact_url: string | null; status: string };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const all = await list<Chapter>({ table: "chapters", order: "name", ascending: true });
  const s = q.toLowerCase().trim();
  const rows = all.filter((c) => !s || [c.name, c.region, c.province, c.city].join(" ").toLowerCase().includes(s));
  return (
    <>
      <PageHero status="live" fil="Mga chapter sa inyong lugar" title="Chapters Near You" path="/chapters"
        intro="FLAME PH chapters are local groups of entrepreneurs led by volunteers from the community." />
      <Section>
        <form role="search" className="flex gap-2">
          <label htmlFor="cq" className="sr-only">Search by region, province or city</label>
          <input id="cq" name="q" defaultValue={q} placeholder="Region, province or city" className="input" />
          <button className="btn btn-primary">Search</button>
        </form>
        <div className="mt-6">
          {rows.length === 0 ? (
            <EmptyState title={q ? `No chapter in "${q}" yet.` : "No chapter in your area yet."} text="Start one and lead your local MSME community." cta={{ href: "/get-involved/chapter-leader", label: "Become a chapter leader" }} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((c) => (
                <li key={c.id} className="card p-5">
                  <p className="text-xs font-bold uppercase text-flame-strong">{c.status === "active" ? "Active" : c.status === "forming" ? "Forming" : "Inactive"}</p>
                  <h2 className="mt-1 text-lg font-bold">{c.name}</h2>
                  <p className="text-sm text-muted">{[c.city, c.province, c.region].filter(Boolean).join(", ")}</p>
                  {c.leader_name && <p className="mt-2 text-sm">Leader: <span className="font-semibold">{c.leader_name}</span></p>}
                  {c.description && <p className="mt-2 text-[15px] text-muted">{c.description}</p>}
                  {c.contact_url && <a href={c.contact_url} target="_blank" rel="noopener" className="btn btn-outline mt-3 min-h-11 px-3 text-sm">Contact chapter</a>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {rows.length > 0 && <p className="mt-6">Hindi mo makita ang lugar mo? <Link className="font-semibold text-mph underline" href="/get-involved/chapter-leader">Start a chapter</Link>.</p>}
      </Section>
    </>
  );
}
