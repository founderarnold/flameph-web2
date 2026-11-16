import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";

export type SuggestedBiz = { id: string; owner_id: string; name: string; slug: string; sector: string | null; city: string | null; province: string | null; logo_url: string | null; chapter_id?: string | null };

/** Who the member already follows. Empty until the 0016 database update is run. */
export async function followingIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("member_follows").select("followee_id").eq("follower_id", userId);
  return new Set(error ? [] : (data ?? []).map((r) => r.followee_id as string));
}

/** Published MSMEs to connect with: same chapter, then industries the member picked, then same province. Never the member's own business. */
export async function suggestedMembers(userId: string, m: { industries?: string[] | null; chapter_id?: string | null; province?: string | null; sector?: string | null }, limit = 8) {
  const rows = await list<SuggestedBiz>({ table: "businesses", select: "*", filters: PUBLIC_BUSINESS_FILTERS, order: "created_at", limit: 200 });
  const want = new Set([...(m.industries ?? []), ...(m.sector ? [m.sector] : [])]);
  const prov = (m.province ?? "").toLowerCase();
  const score = (b: SuggestedBiz) => (m.chapter_id && b.chapter_id === m.chapter_id ? 4 : 0) + (b.sector && want.has(b.sector) ? 2 : 0) + (prov && b.province?.toLowerCase() === prov ? 1 : 0);
  const seen = new Set<string>();
  return rows
    .filter((b) => b.owner_id !== userId && !seen.has(b.owner_id) && seen.add(b.owner_id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
