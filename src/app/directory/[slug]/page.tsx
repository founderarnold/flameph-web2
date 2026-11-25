import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publicBusinessBySlug } from "@/lib/directory";
import { isApprovedListing } from "@/lib/directory-feed";
import { BusinessProfile, type B } from "@/components/listing/BusinessProfile";

// Read through the server-checked directory list: visitors can't read the owner's profile row, so the database's
// "active owner" rule hides every listing from a plain visitor query (that made these pages 404 for visitors).
const get = async (slug: string) => {
  const b = await publicBusinessBySlug<B & { id: string; owner_id: string; slug: string }>(slug);
  return b && isApprovedListing(b) ? b : undefined;
};

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
