import { PageHero, Section, EmptyState } from "@/components/ui";
import { list, mediaUrl } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Featured Partners", "Organizations with a signed partnership agreement with FLAME PH.", "/about/partners");

type P = { id: string; name: string; description: string | null; logo_path: string | null; website: string | null; partnership_type: string | null };

export default async function Page() {
  const rows = await list<P>({ table: "partners_public", order: "name", ascending: true });
  return (
    <>
      <PageHero status="live" fil="Mga katuwang" title="Featured Partners" path="/about/partners" intro="Organizations are listed here only when a signed partnership agreement is on file with FLAME PH." />
      <Section>
        {rows.length === 0 ? <EmptyState title="Partnerships are being formalized." text="Want to partner with FLAME PH?" cta={{ href: "/get-involved/partner", label: "Join as partner" }} /> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <li key={p.id} className="card p-5">
                {p.logo_path && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl(p.logo_path)!} alt={`${p.name} logo`} loading="lazy" className="h-16 w-auto object-contain" />
                )}
                <h2 className="mt-3 text-lg font-bold">{p.name}</h2>
                {p.partnership_type && <p className="text-sm text-muted">{p.partnership_type}</p>}
                {p.description && <p className="mt-2 text-[15px] text-muted">{p.description}</p>}
                {p.website && <a href={p.website} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-11 items-center text-mph underline">Website ↗</a>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
