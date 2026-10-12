import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/ui";
import { ShareButtons } from "@/components/ShareButtons";
import { list, mediaUrl } from "@/lib/content";

type B = { id: string; name: string; slug: string; sector: string | null; description: string | null; products: string | null; city: string | null; province: string | null; contact_messenger: string | null; contact_viber: string | null; contact_phone: string | null; contact_email: string | null; marketplaceph_url: string | null; photos: string[]; verified: boolean };

const get = async (slug: string) => (await list<B>({ table: "businesses", filters: { slug, published: true }, limit: 1 }))[0];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await get((await params).slug);
  return b ? { title: b.name, description: b.description?.slice(0, 160) ?? `${b.name} on the FLAME PH business directory`, alternates: { canonical: `/directory/${b.slug}` } } : { title: "Business not found" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const b = await get((await params).slug);
  if (!b) notFound();
  const messenger = b.contact_messenger ? (b.contact_messenger.startsWith("http") ? b.contact_messenger : `https://m.me/${b.contact_messenger}`) : null;
  const viber = b.contact_viber ? `viber://chat?number=${encodeURIComponent(b.contact_viber.replace(/^0/, "+63").replace(/\s/g, ""))}` : null;
  return (
    <>
      <section className="border-b border-line bg-bg-warm">
        <div className="container-x py-10">
          <p className="text-sm font-bold uppercase text-flame-strong">{b.sector ?? "Business"}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-extrabold text-primary sm:text-4xl">
            {b.name}{b.verified && <span className="rounded-full bg-ok-soft px-3 py-1 text-sm font-bold text-ok">✓ Verified</span>}
          </h1>
          <p className="mt-2 text-lg text-muted">{[b.city, b.province].filter(Boolean).join(", ")}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {messenger && <a href={messenger} target="_blank" rel="noopener" className="btn btn-primary">Messenger</a>}
            {viber && <a href={viber} className="btn btn-primary">Viber</a>}
            {b.contact_phone && <a href={`tel:${b.contact_phone.replace(/\s/g, "")}`} className="btn btn-outline">Call</a>}
            {b.contact_email && <a href={`mailto:${b.contact_email}`} className="btn btn-outline">Email</a>}
            {b.marketplaceph_url && <a href={b.marketplaceph_url} target="_blank" rel="noopener" className="btn btn-flame">Shop on MarketplacePH ↗</a>}
          </div>
        </div>
      </section>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            {b.description && <><h2 className="text-xl font-bold">About</h2><p className="mt-2 whitespace-pre-line">{b.description}</p></>}
            {b.products && <><h2 className="mt-8 text-xl font-bold">Products & services</h2><p className="mt-2 whitespace-pre-line">{b.products}</p></>}
            {b.photos?.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-3">
                {b.photos.map((p, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={mediaUrl(p)!} alt={`${b.name} photo ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
          </div>
          <aside className="space-y-4">
            <div className="card p-4 text-sm text-muted">
              Listed by a FLAME PH member. {b.verified ? "FLAME PH checked this business's registration documents." : "This listing has not been document-verified yet."} FLAME PH does not guarantee products or transactions.
            </div>
            <ShareButtons path={`/directory/${b.slug}`} title={b.name} />
          </aside>
        </div>
      </Section>
    </>
  );
}
