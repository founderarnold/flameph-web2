import { requireUser } from "@/lib/auth";
import { BusinessEditor } from "@/components/BusinessEditor";
import { SECTORS } from "@/app/directory/page";
import { PROVINCES } from "@/content/ph-provinces";
import { hasExtras } from "@/lib/listing";
import { ProductsEditor, type ProductRow } from "@/components/listing/ProductsEditor";

export default async function Business({ searchParams }: { searchParams: Promise<{ ridesafe?: string }> }) {
  const { ridesafe } = await searchParams;
  const providerType = ridesafe?.trim().slice(0, 80) || "";
  const returnTo = providerType ? `/account/business?ridesafe=${encodeURIComponent(providerType)}` : "/account/business";
  const { supabase, user } = await requireUser(returnTo);
  const { data: biz } = await supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
  const { data: products, error: productsError } = biz
    ? await supabase.from("business_products").select("*").eq("business_id", biz.id).order("sort").order("created_at")
    : { data: null, error: null };
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold text-primary">My business listing</h1>
      <p className="mt-2 text-muted">Your listing becomes a free mini website in the FLAME PH directory. Show only your city, never your home address.</p>
      {providerType && <div className="mt-5 rounded-xl border border-primary/20 bg-primary-soft p-4"><strong className="text-primary">RideSafe provider signup · {providerType}</strong><p className="mt-1 text-sm text-muted">Use this shared FLAME PH account to add or update your business listing. Add the service and a public landmark so drivers can find you. New listings stay unpublished until you choose to publish them.</p></div>}
      <BusinessEditor userId={user.id} initial={biz ? { ...biz, product_count: products?.length ?? 0 } : providerType ? { sector: "Services", products: `RideSafe provider service: ${providerType}`, published: false } : null} sectors={SECTORS} provinces={PROVINCES} supportsExtras={hasExtras(biz)} />
      {biz?.id && !productsError && <ProductsEditor userId={user.id} businessId={biz.id} initial={(products ?? []) as ProductRow[]} />}
      {!biz?.id && <p className="mt-4 text-sm text-muted">Save your listing first, then you can add products with prices.</p>}
    </div>
  );
}
