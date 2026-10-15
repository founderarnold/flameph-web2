import { requireUser } from "@/lib/auth";
import { BusinessEditor } from "@/components/BusinessEditor";
import { SECTORS } from "@/app/directory/page";
import { PROVINCES } from "@/content/ph-provinces";
import { hasExtras } from "@/lib/listing";
import { ProductsEditor, type ProductRow } from "@/components/listing/ProductsEditor";

export default async function Business() {
  const { supabase, user } = await requireUser("/account/business");
  const { data: biz } = await supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
  const { data: products, error: productsError } = biz
    ? await supabase.from("business_products").select("*").eq("business_id", biz.id).order("sort").order("created_at")
    : { data: null, error: null };
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold text-primary">My business listing</h1>
      <p className="mt-2 text-muted">Your listing becomes a free mini website in the FLAME PH directory. Show only your city, never your home address.</p>
      <BusinessEditor userId={user.id} initial={biz ? { ...biz, product_count: products?.length ?? 0 } : null} sectors={SECTORS} provinces={PROVINCES} supportsExtras={hasExtras(biz)} />
      {biz?.id && !productsError && <ProductsEditor userId={user.id} businessId={biz.id} initial={(products ?? []) as ProductRow[]} />}
      {!biz?.id && <p className="mt-4 text-sm text-muted">Save your listing first, then you can add products with prices.</p>}
    </div>
  );
}
