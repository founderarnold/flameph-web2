import Link from "next/link";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { mediaUrl } from "@/lib/content";
import { meta } from "@/lib/meta";
import { FlameAdSlot } from "@/components/FlameAdSlot";
import { publicBusinesses } from "@/lib/directory";

export const metadata = meta("Free Business Directory", "Find Filipino MSMEs who are FLAME PH members. List your business for free.", "/directory");

export type Biz = { id: string; owner_id: string; name: string; slug: string; sector: string | null; description: string | null; city: string | null; province: string | null; region: string | null; photos: string[]; verified: boolean };
export const SECTORS = ["Food & beverage", "Retail / sari-sari", "Agriculture", "Manufacturing", "Services", "Beauty & wellness", "Crafts & fashion", "Technology", "Tourism", "Other"];

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; sector?: string; region?: string }> }) {
  const sp = await searchParams;
  const all = await publicBusinesses<Biz>();
  const regions = [...new Set(all.map((b) => b.province).filter(Boolean))].sort() as string[];
  const q = (sp.q || "").toLowerCase();
  const rows = all.filter((b) => (!sp.sector || b.sector === sp.sector) && (!sp.region || b.province === sp.region) && (!q || `${b.name} ${b.description} ${b.city}`.toLowerCase().includes(q)));
  return (
    <>
      <PageHero status="live" fil="Libreng direktoryo ng negosyo" title="Free Business Directory" path="/directory"
        intro="Real businesses owned by FLAME PH members who chose to be listed. A Verified badge means we checked their DTI, SEC or BMBE documents.">
        <Link href="/account/business" className="btn btn-flame">List your business free</Link>
      </PageHero>
      <Section>
        <form role="search" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <label htmlFor="dq" className="sr-only">Search businesses</label>
          <input id="dq" name="q" defaultValue={sp.q} placeholder="Search businesses…" className="input" />
          <select name="sector" defaultValue={sp.sector ?? ""} className="input" aria-label="Sector">
            <option value="">All sectors</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select name="region" defaultValue={sp.region ?? ""} className="input" aria-label="Province">
            <option value="">All provinces</option>{regions.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary">Search</button>
        </form>
        <FlameAdSlot slot="LISTING_FEATURED" category={sp.sector?.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"") || "msme-directory"} region={sp.region?.toLowerCase().replace(/[^a-z0-9]+/g,"-")} className="mt-5" />
        <div className="mt-6">
          {rows.length === 0 ? (
            <EmptyState title={all.length ? "Walang tugma sa search mo." : "Wala pang nakalistang negosyo dito."} text={all.length ? "Try another sector or province." : "Be the first — list your business for free."} cta={{ href: "/account/business", label: "List your business" }} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((b) => (
                <li key={b.id}>
                  <Link href={`/directory/${b.slug}`} className="card block h-full overflow-hidden hover:border-primary">
                    {b.photos?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(b.photos[0])!} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />
                    ) : <div className="grid aspect-[16/9] place-items-center bg-primary-soft font-display text-3xl font-extrabold text-primary">{b.name.slice(0, 1)}</div>}
                    <div className="p-4">
                      <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{b.name}</h2>{b.verified && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">✓ Verified</span>}</div>
                      <p className="text-sm text-muted">{[b.sector, b.city, b.province].filter(Boolean).join(" · ")}</p>
                      {b.description && <p className="mt-2 line-clamp-2 text-[15px] text-muted">{b.description}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
