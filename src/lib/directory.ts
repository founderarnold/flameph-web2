import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient, createPublicClient } from "@/lib/supabase/server";

/**
 * Public directory data with the owner's moderation status enforced server-side.
 * The service client is used only to compare owner IDs with profile status; private
 * profile fields are never returned to the page.
 */
export const publicBusinesses = unstable_cache(
  async <T extends { id: string; owner_id: string }>() => {
    const admin = createAdminClient();
    if (admin) {
      const { data: businesses, error } = await admin.from("businesses").select("*").eq("published", true).order("created_at", { ascending: false }).limit(1000);
      if (error || !businesses?.length) return [] as T[];
      const ownerIds = [...new Set(businesses.map((business) => business.owner_id))];
      const { data: activeProfiles } = await admin.from("profiles").select("id").in("id", ownerIds).eq("status", "active");
      const active = new Set((activeProfiles ?? []).map((profile) => profile.id));
      return businesses.filter((business) => active.has(business.owner_id)) as T[];
    }

    // Safe fallback for environments without the server key. Production also has
    // a database policy that applies the same active-owner rule.
    const pub = createPublicClient();
    if (!pub) return [] as T[];
    const { data } = await pub.from("businesses").select("*").eq("published", true).order("created_at", { ascending: false }).limit(1000);
    return (data ?? []) as T[];
  },
  ["public-businesses-active-owners"],
  { revalidate: 60, tags: ["content", "directory"] },
);

export async function publicBusinessBySlug<T extends { id: string; owner_id: string; slug: string }>(slug: string) {
  const rows = await publicBusinesses<T>();
  return rows.find((business) => business.slug === slug);
}
