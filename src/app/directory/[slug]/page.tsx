import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Section } from "@/components/ui";
import { ShareButtons } from "@/components/ShareButtons";
import { mediaUrl } from "@/lib/content";
import { publicBusinessBySlug, publicBusinesses } from "@/lib/directory";
import { SOCIALS } from "@/lib/listing";
import { getSession } from "@/lib/auth";
import { createPublicClient } from "@/lib/supabase/server";
import { peso } from "@/lib/growth";
import { InquiryForm } from "@/components/listing/InquiryForm";
import { ListingTracker } from "@/components/listing/ListingTracker";
import { saveReview, deleteReview, reportBusiness } from "./actions";

type B = {
  id: string; owner_id: string; created_at: string; name: string; slug: string; sector: string | null; description: string | null; products: string | null; city: string | null; province: string | null;
  contact_messenger: string | null; contact_viber: string | null; contact_phone: string | null; contact_email: string | null; marketplaceph_url: string | null; photos: string[]; verified: boolean;
  logo_url?: string | null; cover_url?: string | null; hours?: string | null; map_landmark?: string | null;
  facebook_url?: string | null; tiktok_url?: string | null; instagram_url?: string | null; shopee_url?: string | null; lazada_url?: string | null; website_url?: string | null;
};

type Product = { id: string; name: string; description: string | null; price: number | null; price_from: boolean; unit: string | null; min_order: string | null; photo_path: string | null; link_url: string | null };
type Review = { id: string; user_id: string; rating: number; body: string | null; reviewer_name: string | null; reviewer_city: string | null; created_at: string };

const safeLink = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

const get = async (slug: string) => publicBusinessBySlug<B>(slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await get((await params).slug);
  return b ? { title: b.name, description: b.description?.slice(0, 160) ?? `${b.name} on the FLAME PH business directory`, alternates: { canonical: `/directory/${b.slug}` } } : { title: "Business not found" };
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ review?: string; report?: string }> }) {
  const b = await get((await params).slug);
  if (!b) notFound();
  const sp = await searchParams;
  const pub = createPublicClient();
  const { supabase, user } = await getSession();
  // Products, reviews and related listings; each is empty until the 0003 database update is run.
  const [productsRes, reviewsRes, profileRes, all] = await Promise.all([
    pub?.from("business_products").select("*").eq("business_id", b.id).order("sort").order("created_at"),
    pub?.from("business_reviews").select("id,user_id,rating,body,reviewer_name,reviewer_city,created_at").eq("business_id", b.id).eq("hidden", false).order("created_at", { ascending: false }).limit(50),
    user && supabase ? supabase.from("profiles").select("full_name, mobile").eq("id", user.id).single() : null,
    publicBusinesses<B>(),
  ]);
  const products = (productsRes?.data ?? []) as Product[];
  const reviews = (reviewsRes?.data ?? []) as Review[];
  const avg = reviews.length ? reviews.reduce((n, x) => n + x.rating, 0) / reviews.length : 0;
  const mine = user ? reviews.find((x) => x.user_id === user.id) : undefined;
  const isOwner = user?.id === b.owner_id;
  const related = all.filter((x) => x.id !== b.id && b.sector && x.sector === b.sector).sort((x) => (x.province === b.province ? -1 : 1)).slice(0, 3);
  const since = new Date(b.created_at).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const messenger = b.contact_messenger ? (b.contact_messenger.startsWith("http") ? b.contact_messenger : `https://m.me/${b.contact_messenger}`) : null;
  const viber = b.contact_viber ? `viber://chat?number=${encodeURIComponent(b.contact_viber.replace(/^0/, "+63").replace(/\s/g, ""))}` : null;
  const tel = b.contact_phone ? `tel:${b.contact_phone.replace(/\s/g, "")}` : null;
  const shop = safeLink(b.marketplaceph_url);
  const inquire = "#inquire";
  const photos = b.photos ?? [];
  const cover = mediaUrl(b.cover_url) ?? mediaUrl(photos[0]);
  const logo = mediaUrl(b.logo_url);
  const place = [b.map_landmark, b.city, b.province, "Philippines"].filter(Boolean).join(", ");
  const maps = b.city || b.map_landmark ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
  const socials = SOCIALS.map((x) => ({ ...x, href: safeLink(b[x.key]) })).filter((x) => x.href);
  const bar = [
    (messenger || viber) && { href: (messenger ?? viber)!, label: "Message", external: Boolean(messenger) },
    tel && { href: tel, label: "Call", external: false },
    { href: inquire, label: "Inquire", external: false },
  ].filter(Boolean) as { href: string; label: string; external: boolean }[];
  return (
    <>
      <ListingTracker bizId={b.id} />
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
              <p className="mt-2 flex flex-wrap items-center gap-x-3 text-lg text-muted">
                <span>{[b.city, b.province].filter(Boolean).join(", ")}</span>
                {reviews.length > 0 && <a href="#reviews" className="text-base font-semibold"><span className="text-gold">★</span> {avg.toFixed(1)} ({reviews.length})</a>}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {messenger && <a data-track href={messenger} target="_blank" rel="noopener" className="btn btn-primary">Messenger</a>}
            {viber && <a data-track href={viber} className="btn btn-primary">Viber</a>}
            {tel && <a data-track href={tel} className="btn btn-outline">Call</a>}
            {b.contact_email && <a data-track href={`mailto:${b.contact_email}`} className="btn btn-outline">Email</a>}
            <a href="#inquire" className="btn btn-outline">Send inquiry</a>
            {shop && <a data-track href={shop} target="_blank" rel="noopener" className="btn btn-flame">Shop on MarketplacePH ↗</a>}
          </div>
          {isOwner && <p className="mt-4 text-sm"><Link href="/account/business" className="font-bold text-mph underline">Edit your listing</Link> · <Link href="/account/inquiries" className="font-bold text-mph underline">See your inquiries</Link></p>}
        </div>
      </section>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            {b.description && <><h2 className="text-xl font-bold">About</h2><p className="mt-2 whitespace-pre-line">{b.description}</p></>}
            {(products.length > 0 || b.products) && <h2 id="products" className="mt-8 text-xl font-bold">Products & services</h2>}
            {products.length > 0 && (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {products.map((x, i) => (
                  <li key={x.id} className="card flex gap-3 p-3">
                    {x.photo_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(x.photo_path)!} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    ) : <span aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-primary-soft font-display text-2xl font-extrabold text-primary">{x.name.slice(0, 1)}</span>}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">{x.name}</h3>
                      {x.description && <p className="line-clamp-2 text-sm text-muted">{x.description}</p>}
                      {x.price !== null && <p className="mt-1 font-extrabold">{x.price_from && <span className="text-sm font-semibold text-muted">from </span>}{peso(x.price)}{x.unit && <span className="text-sm font-semibold text-muted"> / {x.unit}</span>}</p>}
                      {x.min_order && <p className="text-xs text-muted">Min. order: {x.min_order}</p>}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`#inquire-${i}`} className="btn btn-outline min-h-9 px-3 py-1 text-sm">Inquire</a>
                        {safeLink(x.link_url) && <a data-track href={safeLink(x.link_url)!} target="_blank" rel="noopener" className="btn btn-flame min-h-9 px-3 py-1 text-sm">Order ↗</a>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {b.products && <p className={`whitespace-pre-line ${products.length ? "mt-4 text-muted" : "mt-2"}`}>{b.products}</p>}
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

            <section id="reviews" className="mt-10 scroll-mt-24">
              <h2 className="text-xl font-bold">Reviews from FLAME PH members</h2>
              {reviews.length > 0 ? (
                <>
                  <p className="mt-1 text-muted"><span className="text-gold">★</span> <b className="text-fg">{avg.toFixed(1)}</b> out of 5 · {reviews.length} review{reviews.length > 1 && "s"}</p>
                  <ul className="mt-3 space-y-3">
                    {reviews.slice(0, 10).map((x) => (
                      <li key={x.id} className="card p-4">
                        <p><span className="text-gold" aria-label={`${x.rating} out of 5`}>{"★".repeat(x.rating)}<span className="text-line">{"★".repeat(5 - x.rating)}</span></span> <span className="text-sm text-muted">· {x.reviewer_name ?? "Member"}{x.reviewer_city && `, ${x.reviewer_city}`} · {new Date(x.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</span></p>
                        {x.body && <p className="mt-1">{x.body}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="mt-1 text-muted">No reviews yet.</p>}
              {sp.review === "saved" && <p role="status" className="mt-3 rounded-lg bg-ok-soft p-3 font-semibold text-ok">Salamat! Your review is posted.</p>}
              {sp.review === "own" && <p role="alert" className="mt-3 rounded-lg bg-warn-soft p-3 font-semibold text-warn">You can&apos;t review your own business.</p>}
              {sp.review === "error" && <p role="alert" className="mt-3 rounded-lg bg-warn-soft p-3 font-semibold text-warn">Your review wasn&apos;t saved. Please try again.</p>}
              {!isOwner && (user ? (
                <form action={saveReview} className="card mt-4 space-y-3 p-4">
                  <input type="hidden" name="slug" value={b.slug} /><input type="hidden" name="business_id" value={b.id} />
                  <fieldset>
                    <legend className="label">{mine ? "Update your review" : "Bought from them? Leave a review"}</legend>
                    <div className="flex flex-wrap gap-2">
                      {[5, 4, 3, 2, 1].map((n) => (
                        <label key={n} className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                          <input type="radio" name="rating" value={n} required defaultChecked={mine?.rating === n} className="h-4 w-4" />
                          <span className="text-gold" aria-label={`${n} stars`}>{"★".repeat(n)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div><label className="label" htmlFor="rv-body">What was it like? (optional)</label><textarea id="rv-body" name="body" rows={3} maxLength={800} defaultValue={mine?.body ?? ""} className="input" /></div>
                  <p className="text-sm text-muted">Shown with your first name and city.</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary">{mine ? "Update review" : "Post review"}</button>
                    {mine && <button formAction={deleteReview} className="btn btn-ghost">Remove my review</button>}
                  </div>
                </form>
              ) : <p className="mt-3"><Link href={`/login?next=${encodeURIComponent(`/directory/${b.slug}`)}`} className="font-bold text-mph underline">Log in</Link> to leave a review.</p>)}
            </section>

            <section id="inquire" className="mt-10 scroll-mt-24">
              <h2 className="text-xl font-bold">Send an inquiry</h2>
              <p className="mt-1 text-muted">Ask about prices, orders, delivery or partnerships.</p>
              <div className="card mt-3 p-4">
                <InquiryForm bizId={b.id} bizName={b.name} products={products.map((x) => x.name)}
                  defaults={{ name: profileRes?.data?.full_name ?? undefined, email: user?.email ?? undefined, mobile: profileRes?.data?.mobile ?? undefined }} />
              </div>
            </section>
          </div>
          <aside className="space-y-4">
            {(b.hours || maps) && (
              <div className="card space-y-3 p-4">
                {b.hours && <div><p className="font-bold">Opening hours</p><p className="mt-1 whitespace-pre-line text-muted">{b.hours}</p></div>}
                {maps && <div><p className="font-bold">Location</p><p className="mt-1 text-muted">{[b.map_landmark, b.city, b.province].filter(Boolean).join(", ")}</p>
                  <a data-track href={maps} target="_blank" rel="noopener" className="btn btn-outline mt-2">{b.map_landmark ? "Get directions" : "See on map"} ↗</a></div>}
              </div>
            )}
            {socials.length > 0 && (
              <div className="card p-4">
                <p className="font-bold">Find us online</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {socials.map((x) => <a data-track key={x.key} href={x.href!} target="_blank" rel="noopener nofollow" className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:bg-bg-soft">{x.label} ↗</a>)}
                </div>
              </div>
            )}
            <div className="card p-4 text-sm text-muted">
              <p className="font-semibold text-fg">FLAME PH member since {since}</p>
              Listed by a FLAME PH member. {b.verified ? "FLAME PH checked this business's registration documents." : "This listing has not been document-verified yet."} FLAME PH does not guarantee products or transactions.
            </div>
            <ShareButtons path={`/directory/${b.slug}`} title={b.name} />
            {!isOwner && (
              <details id="report" className="card p-4 text-sm">
                <summary className="cursor-pointer font-semibold text-flame-strong">Report this listing</summary>
                {sp.report === "received" && <p role="status" className="mt-2 rounded-lg bg-ok-soft p-2 font-semibold text-ok">Report received. FLAME PH admins will review it.</p>}
                {sp.report === "limit" && <p role="alert" className="mt-2 rounded-lg bg-warn-soft p-2 font-semibold text-warn">You have already sent several reports today. Please wait for an admin review.</p>}
                {(sp.report === "invalid" || sp.report === "error") && <p role="alert" className="mt-2 rounded-lg bg-warn-soft p-2 font-semibold text-warn">The report was not saved. Please check the details and try again.</p>}
                {user ? (
                  <form action={reportBusiness} className="mt-3 space-y-3">
                    <input type="hidden" name="business_id" value={b.id} />
                    <input type="hidden" name="slug" value={b.slug} />
                    <div><label className="label" htmlFor="report-reason">Reason</label><select id="report-reason" name="reason" className="input" required><option value="">Choose a reason</option><option value="spam">Spam or fake listing</option><option value="fraud">Possible fraud or scam</option><option value="abuse">Abusive or harmful content</option><option value="wrong_information">False or misleading information</option><option value="closed">Business appears closed</option><option value="other">Other concern</option></select></div>
                    <div><label className="label" htmlFor="report-details">What happened?</label><textarea id="report-details" name="details" className="input" rows={3} minLength={10} maxLength={1000} required /></div>
                    <p className="text-xs text-muted">Your identity is visible only to authorized FLAME PH admins. The business owner will not see who reported them.</p>
                    <button className="btn btn-outline w-full">Send report</button>
                  </form>
                ) : <p className="mt-2"><Link className="font-semibold text-mph underline" href={`/login?next=${encodeURIComponent(`/directory/${b.slug}#report`)}`}>Log in</Link> to report this listing.</p>}
              </details>
            )}
          </aside>
        </div>
        {related.length > 0 && (
          <section className="mt-12 border-t border-line pt-8">
            <h2 className="text-xl font-bold">More {b.sector?.toLowerCase()} businesses</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {related.map((x) => (
                <li key={x.id}><Link href={`/directory/${x.slug}`} className="card block p-4 hover:border-primary"><p className="font-bold">{x.name}</p><p className="text-sm text-muted">{[x.city, x.province].filter(Boolean).join(", ")}</p></Link></li>
              ))}
            </ul>
          </section>
        )}
      </Section>
      {bar.length > 0 && (
        <>
          <div aria-hidden className="h-16 lg:hidden" />
          <nav aria-label={`Contact ${b.name}`} className="fixed inset-x-0 z-30 border-t border-line bg-bg/95 px-3 py-2 backdrop-blur lg:hidden" style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}>
            <div className={`grid gap-2 ${bar.length === 3 ? "grid-cols-3" : bar.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              {bar.map((x, i) => (
                <a key={x.label} {...(x.label === "Inquire" ? {} : { "data-track": true })} href={x.href} {...(x.external ? { target: "_blank", rel: "noopener" } : {})} className={`btn min-h-11 ${i === 0 ? "btn-primary" : "btn-outline"}`}>{x.label}</a>
              ))}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
