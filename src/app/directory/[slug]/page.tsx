import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { BusinessProfile, type B } from "@/components/listing/BusinessProfile";

const get = async (slug: string) => (await list<B>({ table: "businesses", filters: { slug, ...PUBLIC_BUSINESS_FILTERS }, limit: 1 }))[0];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await get((await params).slug);
  return b ? { title: b.name, description: b.description?.slice(0, 160) ?? `${b.name} on the FLAME PH business directory`, alternates: { canonical: `/directory/${b.slug}` } } : { title: "Business not found" };
}

// Kept as it was; the address forwards to the FlamePH Pages directory (next.config.ts). The same profile is shown at /members/[slug].
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ review?: string; note?: string }> }) {
  const b = await get((await params).slug);
  if (!b) notFound();
  return <BusinessProfile business={b} review={(await searchParams).review} note={(await searchParams).note} basePath="/directory" />;
}
