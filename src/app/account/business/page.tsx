import { requireUser } from "@/lib/auth";
import { BusinessEditor } from "@/components/BusinessEditor";
import { SECTORS } from "@/app/directory/page";
import { PROVINCES } from "@/content/ph-provinces";
import { hasExtras } from "@/lib/listing";

export default async function Business() {
  const { supabase, user } = await requireUser("/account/business");
  const { data: biz } = await supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle();
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold text-primary">My business listing</h1>
      <p className="mt-2 text-muted">Your listing becomes a free mini website in the FLAME PH directory. Show only your city, never your home address.</p>
      <BusinessEditor userId={user.id} initial={biz} sectors={SECTORS} provinces={PROVINCES} supportsExtras={hasExtras(biz)} />
    </div>
  );
}
