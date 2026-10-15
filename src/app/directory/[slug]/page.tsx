import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/ui";
import { ShareButtons } from "@/components/ShareButtons";
import { list, mediaUrl } from "@/lib/content";
import { SOCIALS } from "@/lib/listing";

type B = {
  id: string; name: string; slug: string; sector: string | null; description: string | null; products: string | null; city: string | null; province: string | null;
  contact_messenger: string | null; contact_viber: string | null; contact_phone: string | null; contact_email: string | null; marketplaceph_url: string | null; photos: string[]; verified: boolean;
  logo_url?: string | null; cover_url?: string | null; hours?: string | null; map_landmark?: string | null;
  facebook_url?: string | null; tiktok_url?: string | null; instagram_url?: string | null; shopee_url?: string | null; lazada_url?: string | null; website_url?: string | null;
};

const safeLink = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

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
  const tel = b.contact_phone ? `tel:${b.contact_phone.replace(/\s/g, "")}` : null;
  const shop = safeLink(b.marketplaceph_url);
  const inquire = b.contact_email ? `mailto:${b.contact_email}?subject=${encodeURIComponent(`Inquiry from FLAME PH: ${b.name}`)}` : shop;
  const photos = b.photos ?? [];
  const cover = mediaUrl(b.cover_url) ?? mediaUrl(photos[0]);
  const logo = mediaUrl(b.logo_url);
  const place = [b.map_landmark, b.city, b.province, "Philippines"].filter(Boolean).join(", ");
  const maps = b.city || b.map_landmark ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
  const socials = SOCIALS.map((x) => ({ ...x, href: safeLink(b[x.key]) })).filter((x) => x.href);
  const bar = [
    (messenger || viber) && { href: (messenger ?? viber)!, label: "Message", external: Boolean(messenger) },
    tel && { href: tel, label: "Call", external: false },
    inquire && { href: inquire, label: "Inquire", external: inquire === shop },
  ].filter(Boolean) as { href: string; label: string; external: boolean }[];
  return (
    <>
      <section className="border-b border-line bg-bg-warm">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-56 lg:h-72" />
        )}
        <div className="container-x py-8">
          <div className={`flex flex-wrap items-end gap-4 ${cover && logo ? "-mt-20 sm:-mt-24" : ""}`}>
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${b.name} logo`} className="h-24 w-24 rounded-full border-4 border-bg bg-bg object-cover shadow sm:h-28 sm:w-28" />
            )}
            <div className={cover && logo ? "pt-12 sm:pt-16" : ""}>
              <p className="text-sm font-bold uppercase text-flame-strong">{b.sector ?? "Business"}</p>
              <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-extrabold text-primary sm:text-4xl">
                {b.name}{b.verified && <span className="rounded-full bg-ok-soft px-3 py-1 text-sm font-bold text-ok">✓ Verified</span>}
              </h1>
              <p className="mt-2 text-lg text-muted">{[b.city, b.province].filter(Boolean).join(", ")}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {messenger && <a href={messenger} target="_blank" rel="noopener" className="btn btn-primary">Messenger</a>}
            {viber && <a href={viber} className="btn btn-primary">Viber</a>}
            {tel && <a href={tel} className="btn btn-outline">Call</a>}
            {b.contact_email && <a href={`mailto:${b.contact_email}`} className="btn btn-outline">Email</a>}
            {shop && <a href={shop} target="_blank" rel="noopener" className="btn btn-flame">Shop on MarketplacePH ↗</a>}
          </div>
        </div>
      </section>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div>
            {b.description && <><h2 className="text-xl font-bold">About</h2><p className="mt-2 whitespace-pre-line">{b.description}</p></>}
            {b.products && <><h2 className="mt-8 text-xl font-bold">Products & services</h2><p className="mt-2 whitespace-pre-line">{b.products}</p></>}
            {photos.length > 0 && (
              <>
                <h2 className="mt-8 text-xl font-bold">Photos</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {photos.map((p, i) => (
                    <a key={p} href={mediaUrl(p)!} target="_blank" rel="noopener" className={i === 0 && photos.length > 2 ? "col-span-2 row-span-2" : ""}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(p)!} alt={`${b.name} photo ${i + 1}`} loading="lazy" className="aspect-square h-full w-full rounded-xl object-cover" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
          <aside className="space-y-4">
            {(b.hours || maps) && (
              <div className="card space-y-3 p-4">
                {b.hours && <div><p className="font-bold">Opening hours</p><p className="mt-1 whitespace-pre-line text-muted">{b.hours}</p></div>}
                {maps && <div><p className="font-bold">Location</p><p className="mt-1 text-muted">{[b.map_landmark, b.city, b.province].filter(Boolean).join(", ")}</p>
                  <a href={maps} target="_blank" rel="noopener" className="btn btn-outline mt-2">{b.map_landmark ? "Get directions" : "See on map"} ↗</a></div>}
              </div>
            )}
            {socials.length > 0 && (
              <div className="card p-4">
                <p className="font-bold">Find us online</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {socials.map((x) => <a key={x.key} href={x.href!} target="_blank" rel="noopener nofollow" className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-bg-soft">{x.label} ↗</a>)}
                </div>
              </div>
            )}
            <div className="card p-4 text-sm text-muted">
              Listed by a FLAME PH member. {b.verified ? "FLAME PH checked this business's registration documents." : "This listing has not been document-verified yet."} FLAME PH does not guarantee products or transactions.
            </div>
            <ShareButtons path={`/directory/${b.slug}`} title={b.name} />
          </aside>
        </div>
      </Section>
      {bar.length > 0 && (
        <>
          <div aria-hidden className="h-16 lg:hidden" />
          <nav aria-label={`Contact ${b.name}`} className="fixed inset-x-0 z-30 border-t border-line bg-bg/95 px-3 py-2 backdrop-blur lg:hidden" style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}>
            <div className={`grid gap-2 ${bar.length === 3 ? "grid-cols-3" : bar.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {bar.map((x, i) => (
                <a key={x.label} href={x.href} {...(x.external ? { target: "_blank", rel: "noopener" } : {})} className={`btn min-h-11 ${i === 0 ? "btn-primary" : "btn-outline"}`}>{x.label}</a>
              ))}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
