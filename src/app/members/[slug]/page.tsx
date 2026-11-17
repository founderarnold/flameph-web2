import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { BusinessProfile, type B } from "@/components/listing/BusinessProfile";

const get = async (slug: string) => (await list<B>({ table: "businesses", filters: { slug, ...PUBLIC_BUSINESS_FILTERS }, limit: 1 }))[0];

// Member business profiles. Visitors see only what the owner made public; signed-in members also see members-only details.
// Not indexed by search engines: the public directory is FlamePH Pages.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await get((await params).slug);
  return { title: b ? b.name : "Business not found", description: b?.description?.slice(0, 160) ?? undefined, robots: { index: false } };
}

export default async function MemberProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ review?: string }> }) {
  const b = await get((await params).slug);
  if (!b) notFound();
  return <BusinessProfile business={b} review={(await searchParams).review} basePath="/members" />;
}
