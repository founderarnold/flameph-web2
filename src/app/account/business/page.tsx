import { requireUser } from "@/lib/auth";
import { BusinessEditor } from "@/components/BusinessEditor";
import { SECTORS } from "@/lib/listing";
import { PROVINCES } from "@/content/ph-provinces";
import { hasExtras } from "@/lib/listing";
import { ProductsEditor, type ProductRow } from "@/components/listing/ProductsEditor";
import { accountVerificationStatus } from "@/lib/account-verification";
import { BusinessDetails } from "@/components/listing/BusinessDetails";
import { MinisiteCard } from "@/components/listing/MinisiteCard";
import { SectionList, SectionPager } from "@/components/listing/ListingSections";
import { StorefrontReminder } from "@/components/listing/StorefrontReminder";
import { STOREFRONT_REWARDS, isSection, sectionStatus, type ListingState } from "@/lib/listing-sections";

export default async function Business({ searchParams }: { searchParams: Promise<{ ridesafe?: string; details?: string; section?: string }> }) {
  const { ridesafe, details, section: asked } = await searchParams;
  const providerType = ridesafe?.trim().slice(0, 80) || "";
  const query = providerType ? `ridesafe=${encodeURIComponent(providerType)}` : "";
  const returnTo = providerType ? `/account/business?${query}` : "/account/business";
  const { supabase, user } = await requireUser(returnTo);
  const { data: verificationData } = await supabase.rpc("account_verification_status");
  const verification = accountVerificationStatus(verificationData, user);
  const [{ data: biz }, { data: profile }, { data: sites }, { data: earned }] = await Promise.all([
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("member_minisites").select("site_id").eq("owner_id", user.id).eq("published", true).limit(1),
    supabase.from("member_milestones").select("key").eq("user_id", user.id).like("key", "storefront:%"),
  ]);
  const { data: products, error: productsError } = biz
    ? await supabase.from("business_products").select("*").eq("business_id", biz.id).order("sort").order("created_at").limit(100)
    : { data: null, error: null };
  const rideSafeTag = providerType && !String(biz?.products ?? "").toLowerCase().includes(`ridesafe provider service: ${providerType.toLowerCase()}`)
    ? `RideSafe provider service: ${providerType}`
    : "";
  const editorInitial = biz
    ? { ...biz, products: [String(biz.products ?? "").trim(), rideSafeTag].filter(Boolean).join("\n"), product_count: products?.length ?? 0 }
    : providerType ? { sector: "Services", products: `RideSafe provider service: ${providerType}`, published: false } : null;

  const state: ListingState = { biz, productCount: products?.length ?? 0, hasLiveWebsite: (sites ?? []).length > 0, supportsExtras: hasExtras(biz) };
  const status = sectionStatus(state);
  // With no section in the address, open the first one that still needs something (a new listing starts at the basics).
  const section = isSection(asked) ? asked : details ? "details" : status.firstTodo;

  // Reward points for a finished storefront: saved once each as a growth milestone (counted at 15 points each).
  const have = new Set((earned ?? []).map((m) => m.key));
  const newlyEarned = STOREFRONT_REWARDS.filter((r) => !have.has(r.key) && r.done(state)).map((r) => r.key);
  if (newlyEarned.length) {
    const { error } = await supabase.from("member_milestones").upsert(newlyEarned.map((key) => ({ user_id: user.id, key })), { onConflict: "user_id,key", ignoreDuplicates: true });
    if (!error) newlyEarned.forEach((k) => have.add(k));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold text-primary">My business listing</h1>
      <p className="mt-2 text-muted">Build your free business profile here, one section at a time. Show only your city, never your home address.</p>
      {providerType && <div className="mt-5 rounded-xl border border-primary/20 bg-primary-soft p-4"><strong className="text-primary">RideSafe provider signup · {providerType}</strong><p className="mt-1 text-sm text-muted">Use this shared FLAME PH account to add or update your business listing. Add the service and a public landmark so drivers can find you. New listings remain drafts until FLAME PH approves them for publication.</p></div>}
      <StorefrontReminder rewards={STOREFRONT_REWARDS.map((r) => ({ key: r.key, label: r.label, earned: have.has(r.key) }))} />
      <SectionList items={status.list} current={section} query={query} explicit={isSection(asked) || Boolean(details)} />
      <BusinessEditor userId={user.id} email={user.email ?? ""} ownerName={profile?.full_name ?? ""} verification={verification} initial={editorInitial} sectors={SECTORS} provinces={PROVINCES} supportsExtras={hasExtras(biz)} section={section} query={query} />
      {section === "about" && (biz?.id && !productsError
        ? <ProductsEditor userId={user.id} businessId={biz.id} initial={(products ?? []) as ProductRow[]} />
        : <p className="mt-4 text-sm text-muted">Save your listing first, then you can add products with prices here.</p>)}
      {section === "details" && <>
        {biz?.id ? <BusinessDetails supabase={supabase} biz={biz} status={details} /> : <p className="card mt-4 p-5 text-sm text-muted">Save your business basics first, then you can add your specific industry, chapter and registration numbers here.</p>}
        <SectionPager current="details" query={query} />
      </>}
      {section === "website" && <>
        <MinisiteCard supabase={supabase} userId={user.id} />
        <SectionPager current="website" query={query} />
      </>}
    </div>
  );
}
