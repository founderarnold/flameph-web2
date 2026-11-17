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

export type Suggestion = SuggestedBiz & { mutual?: number };

/** Members the viewer shares connections with (friends of friends, and people followed by people they follow). Empty before the 0018 update. */
export async function mutualCounts(supabase: SupabaseClient, max = 30): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("mutual_suggestions", { max_rows: max });
  return new Map((error ? [] : (data ?? []) as { user_id: string; mutual: number }[]).map((r) => [r.user_id, Number(r.mutual) || 0]));
}

/** Published MSMEs to connect with: same chapter, then industries the member picked, then mutual connections, then same province.
 *  Never the member's own business, and never anyone in `exclude` (already friends, followed, muted or blocked). */
export async function suggestedMembers(userId: string, m: { industries?: string[] | null; chapter_id?: string | null; province?: string | null; sector?: string | null }, limit = 8,
  opts: { mutual?: Map<string, number>; exclude?: Set<string> } = {}): Promise<Suggestion[]> {
  const mutual = opts.mutual ?? new Map<string, number>();
  const [recent, connected] = await Promise.all([
    list<SuggestedBiz>({ table: "businesses", select: "*", filters: PUBLIC_BUSINESS_FILTERS, order: "created_at", limit: 200 }),
    mutual.size ? list<SuggestedBiz>({ table: "businesses", select: "*", filters: { ...PUBLIC_BUSINESS_FILTERS, owner_id: [...mutual.keys()].slice(0, 50) }, limit: 50 }) : Promise.resolve([]),
  ]);
  const want = new Set([...(m.industries ?? []), ...(m.sector ? [m.sector] : [])]);
  const prov = (m.province ?? "").toLowerCase();
  const score = (b: SuggestedBiz) => (m.chapter_id && b.chapter_id === m.chapter_id ? 4 : 0) + (b.sector && want.has(b.sector) ? 2 : 0)
    + 3 * Math.min(mutual.get(b.owner_id) ?? 0, 3) + (prov && b.province?.toLowerCase() === prov ? 1 : 0);
  const seen = new Set<string>();
  return [...connected, ...recent]
    .filter((b) => b.owner_id !== userId && !opts.exclude?.has(b.owner_id) && !seen.has(b.owner_id) && seen.add(b.owner_id))
    .map((b) => ({ ...b, mutual: mutual.get(b.owner_id) ?? 0 }))
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
