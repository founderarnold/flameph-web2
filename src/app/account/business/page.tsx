import { requireUser } from "@/lib/auth";
import { BusinessEditor } from "@/components/BusinessEditor";
import { SECTORS } from "@/lib/listing";
import { PROVINCES } from "@/content/ph-provinces";
import { hasExtras } from "@/lib/listing";
import { ProductsEditor, type ProductRow } from "@/components/listing/ProductsEditor";
import { accountVerificationStatus } from "@/lib/account-verification";
import { BusinessDetails } from "@/components/listing/BusinessDetails";
import { MinisiteCard } from "@/components/listing/MinisiteCard";
import { BackToSteps, StepList } from "@/components/listing/ListingSections";
import { LevelUp, ListingPoints, StorePoints, WebsiteTips } from "@/components/listing/StorefrontReminder";
import { LEVEL_UP_REWARDS, LISTING_REWARDS, STORE_REWARDS, isPublished, isSection, stepStatus, type ListingState, type SectionKey } from "@/lib/listing-sections";
import { awardMilestones } from "@/lib/milestones";
import { marketplaceLinked, storeSummary } from "@/lib/marketplace-store";
import { POINTS } from "@/lib/growth";

export default async function Business({ searchParams }: { searchParams: Promise<{ ridesafe?: string; details?: string; section?: string }> }) {
  const { ridesafe, details, section: asked } = await searchParams;
  const providerType = ridesafe?.trim().slice(0, 80) || "";
  const query = providerType ? `ridesafe=${encodeURIComponent(providerType)}` : "";
  const returnTo = providerType ? `/account/business?${query}` : "/account/business";
  const { supabase, user } = await requireUser(returnTo);
  const { data: verificationData } = await supabase.rpc("account_verification_status");
  const verification = accountVerificationStatus(verificationData, user);
  const [{ data: biz }, { data: profile }, { data: sites }, { data: earnedRows }, linked] = await Promise.all([
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("member_minisites").select("site_id").eq("owner_id", user.id).eq("published", true).limit(1),
    supabase.from("member_milestones").select("key").eq("user_id", user.id).or("key.like.listing:%,key.like.storefront:%,key.like.mph:%"),
    marketplaceLinked(user.id),
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
  const steps = stepStatus(state);
  const published = isPublished(biz);
  // With no section in the address, open the first step that still needs something; when all 6 are done, the status page.
  const section: SectionKey = isSection(asked) ? asked : details ? "details" : steps.firstTodo ?? (published ? "website" : "publish");

  // The member's MarketplacePH store, only on the pages that use it (it is a call to marketplaceph.com).
  const summary = linked && (section === "hours" || section === "marketplace") ? await storeSummary(user.email, 4000) : null;

  // Reward points: saved once each as growth milestones (POINTS.milestone each), shown on the member's Rewards.
  const have = new Set((earnedRows ?? []).map((m) => m.key as string));
  const due = [...LISTING_REWARDS, ...LEVEL_UP_REWARDS].filter((r) => !have.has(r.key) && r.done(state)).map((r) => r.key)
    .concat(summary ? STORE_REWARDS.filter((r) => !have.has(r.key) && r.done(summary)).map((r) => r.key) : []);
  if (due.length && (await awardMilestones(supabase, user.id, due))) due.forEach((k) => have.add(k));
  const mark = <T extends { key: string; label: string }>(list: T[]) => list.map((r) => ({ key: r.key, label: r.label, earned: have.has(r.key) }));

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-extrabold text-primary">My business listing</h1>
      <p className="mt-2 text-muted">Six quick steps to your free business listing in the FLAME PH directory. Show only your city, never your home address.</p>
      {providerType && <div className="mt-5 rounded-xl border border-primary/20 bg-primary-soft p-4"><strong className="text-primary">RideSafe provider signup · {providerType}</strong><p className="mt-1 text-sm text-muted">Use this shared FLAME PH account to add or update your business listing. Add the service and a public landmark so drivers can find you.</p></div>}
      <ListingPoints rewards={mark(LISTING_REWARDS)} />
      <StepList items={steps.list} current={section} query={query} explicit={isSection(asked) || Boolean(details)} points={POINTS.milestone} published={published} />
      <BusinessEditor userId={user.id} email={user.email ?? ""} ownerName={profile?.full_name ?? ""} verification={verification} initial={editorInitial} sectors={SECTORS} provinces={PROVINCES}
        supportsExtras={hasExtras(biz)} section={section} query={query} store={{ linked, summary }} />
      {section === "products" && (biz?.id && !productsError
        ? <ProductsEditor userId={user.id} businessId={biz.id} initial={(products ?? []) as ProductRow[]} />
        : <p className="card mt-4 p-5 text-sm text-muted">Save step 1 (your business name and city) first, then you can add products and packages with prices here.</p>)}
      {section === "hours" && summary?.store && <StorePoints rewards={mark(STORE_REWARDS)} listingCount={summary.listingCount} compact />}
      {section === "details" && <>
        {biz?.id ? <BusinessDetails supabase={supabase} biz={biz} status={details} /> : <p className="card mt-4 p-5 text-sm text-muted">Save step 1 first, then you can add your specific industry, chapter and registration numbers here.</p>}
        <BackToSteps to="basics" query={query} />
      </>}
      {section === "website" && <>
        <WebsiteTips />
        <MinisiteCard supabase={supabase} userId={user.id} />
        <BackToSteps to="basics" query={query} />
      </>}
      {section === "marketplace" && <>
        <StorePoints rewards={mark(STORE_REWARDS)} listingCount={summary?.listingCount ?? 0} linked={linked} storeName={summary?.store?.name ?? null} />
        <BackToSteps to="hours" query={query} />
      </>}
      {section === "publish" && <BackToSteps to="basics" query={query} />}
      <LevelUp query={query} current={section} published={published} rewards={mark(LEVEL_UP_REWARDS)} store={mark(STORE_REWARDS)} />
    </div>
  );
}
