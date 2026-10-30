import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { businessStatusCopy } from "@/lib/business-lifecycle";
import { mediaUrl } from "@/lib/content";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  unit: string | null;
  photo_path: string | null;
};

export default async function BusinessPreview() {
  const { supabase, user } = await requireUser("/account/business/preview");
  const { data: business } = await supabase.from("businesses").select("*")
    .eq("owner_id", user.id).limit(1).maybeSingle();

  if (!business) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-3xl font-extrabold text-primary">Private listing preview</h1>
        <p className="mt-3 text-muted">Save your business draft before previewing it.</p>
        <Link href="/account/business" className="btn btn-primary mt-5">Create your draft</Link>
      </div>
    );
  }

  const { data: productRows } = await supabase.from("business_products").select("id,name,description,price,unit,photo_path")
    .eq("business_id", business.id).order("sort").limit(50);
  const products = (productRows ?? []) as Product[];
  const status = businessStatusCopy(business);
  const photos = (business.photos ?? []) as string[];
  const cover = mediaUrl(business.cover_url) ?? mediaUrl(photos[0]);
  const logo = mediaUrl(business.logo_url);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold uppercase tracking-wide text-flame-strong">Owner-only preview</p>
          <h1 className="text-3xl font-extrabold text-primary">Private listing preview</h1>
        </div>
        <Link href="/account/business" className="btn btn-outline">Back to editor</Link>
      </div>

      <aside className="rounded-xl border border-gold/40 bg-warn-soft p-4 text-warn" aria-label="Preview visibility">
        <p className="font-bold">This preview is visible only inside your signed-in account.</p>
        <p className="mt-1 text-sm">{status.label}: {status.detail} It is not a public directory page and search engines cannot index it.</p>
      </aside>

      <article className="overflow-hidden rounded-2xl border border-line bg-bg shadow-sm">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-40 w-full object-cover sm:h-56 lg:h-72" />
        )}
        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-4">
            {logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`${business.name} logo`} className="h-20 w-20 rounded-full border-4 border-bg object-cover shadow" />
            )}
            <div>
              <p className="text-sm font-bold uppercase text-flame-strong">{business.sector ?? "Business"}</p>
              <h2 className="text-3xl font-extrabold text-primary sm:text-4xl">{business.name}</h2>
              <p className="mt-1 text-muted">{[business.city, business.province].filter(Boolean).join(", ")}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
            <div className="min-w-0 space-y-7">
              {business.description && <section><h3 className="text-xl font-bold">About</h3><p className="mt-2 whitespace-pre-line">{business.description}</p></section>}
              {(products.length > 0 || business.products) && (
                <section>
                  <h3 className="text-xl font-bold">Products & services</h3>
                  {business.products && <p className="mt-2 whitespace-pre-line text-muted">{business.products}</p>}
                  {products.length > 0 && <ul className="mt-4 grid gap-3 sm:grid-cols-2">{products.map((product) => (
                    <li key={product.id} className="rounded-xl border border-line p-3">
                      {product.photo_path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl(product.photo_path)!} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
                      )}
                      <p className="font-bold">{product.name}</p>
                      {product.description && <p className="mt-1 text-sm text-muted">{product.description}</p>}
                      {product.price !== null && <p className="mt-2 font-extrabold">₱{Number(product.price).toLocaleString("en-PH")}{product.unit && <span className="text-sm font-normal text-muted"> / {product.unit}</span>}</p>}
                    </li>
                  ))}</ul>}
                </section>
              )}
              {photos.length > 0 && <section><h3 className="text-xl font-bold">Photos</h3><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={photo} src={mediaUrl(photo)!} alt="" className="aspect-square w-full rounded-xl object-cover" />
              ))}</div></section>}
            </div>

            <aside className="h-fit rounded-xl border border-line bg-bg-soft p-4">
              <h3 className="font-bold">Contact preview</h3>
              <dl className="mt-3 space-y-3 text-sm">
                {business.contact_phone && <div><dt className="font-semibold">Phone</dt><dd className="break-words text-muted">{business.contact_phone}</dd></div>}
                {business.contact_email && <div><dt className="font-semibold">Email</dt><dd className="break-words text-muted">{business.contact_email}</dd></div>}
                {business.contact_messenger && <div><dt className="font-semibold">Messenger</dt><dd className="break-words text-muted">{business.contact_messenger}</dd></div>}
                {!business.contact_phone && !business.contact_email && !business.contact_messenger && <p className="text-muted">Add a public contact method in the editor.</p>}
              </dl>
            </aside>
          </div>
        </div>
      </article>
    </div>
  );
}
