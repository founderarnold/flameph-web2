import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { reasonLabel } from "@/lib/suggest-reasons";

export type SuggestedBiz = { id: string; owner_id: string; name: string; slug: string; sector: string | null; city: string | null; province: string | null; logo_url: string | null; chapter_id?: string | null };

/** Who the member already follows. Empty until the 0016 database update is run. */
export async function followingIds(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("member_follows").select("followee_id").eq("follower_id", userId).limit(500);
  return new Set(error ? [] : (data ?? []).map((r) => r.followee_id as string));
}

export type Suggestion = Omit<SuggestedBiz, "slug"> & {
  slug: string | null; mutual?: number; reason?: string | null;
  /** From member_cards_v2 (0040): the person's own name, their business name, profile photo, Verified badge and follower count. */
  person_name?: string | null; business_name?: string | null; avatar_path?: string | null; verified?: boolean; followers?: number | null;
};

type CardV2 = { id: string; person_name: string; business_name: string | null; slug: string | null; sector: string | null; subsector: string | null;
  city: string | null; province: string | null; chapter_id: string | null; avatar_path: string | null; logo_url: string | null; verified: boolean; followers: number };

/** Card details (photo, business name, place, Verified, followers) for up to 100 members. Empty before the 0040 update. */
export async function cardDetails(supabase: SupabaseClient, ids: string[]): Promise<Map<string, CardV2> | null> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc("member_cards_v2", { ids: [...new Set(ids)].slice(0, 100) });
  if (error) return null;
  return new Map(((data ?? []) as CardV2[]).map((c) => [c.id, c]));
}

/** Adds photo, person and business name, place, Verified and followers to cards. Unchanged before the 0040 update. */
export async function withCardDetails<T extends Suggestion>(supabase: SupabaseClient, cards: T[]): Promise<T[]> {
  const more = await cardDetails(supabase, cards.map((c) => c.owner_id));
  if (!more) return cards;
  return cards.map((c) => {
    const d = more.get(c.owner_id);
    if (!d) return c;
    return { ...c, person_name: d.person_name, business_name: d.business_name ?? c.business_name ?? null, avatar_path: d.avatar_path,
      logo_url: c.logo_url ?? d.logo_url, verified: Boolean(c.verified || d.verified), followers: d.followers,
      city: c.city ?? d.city, province: c.province ?? d.province, sector: c.sector ?? d.sector, slug: c.slug ?? d.slug };
  });
}

export type FollowFilters = { industry: string; category: string; province: string; city: string; verified: boolean; q: string };

/** Members to follow that match the filters (browse_members, 0040), as cards. null before the 0040 update. */
export async function browseMembers(supabase: SupabaseClient, f: FollowFilters, limit = 24): Promise<Suggestion[] | null> {
  const { data, error } = await supabase.rpc("browse_members", {
    p_industry: f.industry || null, p_category: f.category || null, p_province: f.province || null,
    p_city: f.city || null, p_verified: f.verified, p_q: f.q || null, max_rows: limit,
  });
  if (error) return null;
  return peopleCards(supabase, ((data ?? []) as { user_id: string }[]).map((r) => ({ user_id: r.user_id })));
}

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

type Ranked = { user_id: string; reason: string; detail: string | null; score: number };
type Card = { id: string; name: string; slug: string | null; sector: string | null; city: string | null; province: string | null; chapter_id: string | null };

/**
 * Members to follow, from every active member (not only published businesses): same city, same chapter, people you both
 * know, shared industries, same province and shared groups (suggest_members, 0023). Falls back to published MSMEs
 * (suggestedMembers) until that database update is run, or when it finds nobody.
 */
export async function suggestedPeople(supabase: SupabaseClient, userId: string, m: Parameters<typeof suggestedMembers>[1], limit = 8,
  opts: { exclude?: Set<string> } = {}): Promise<Suggestion[]> {
  const { data, error } = await supabase.rpc("suggest_members", { max_rows: Math.min(50, limit + (opts.exclude?.size ?? 0)) });
  const ranked = (error ? [] : (data ?? []) as Ranked[]).filter((r) => r.user_id !== userId && !opts.exclude?.has(r.user_id)).slice(0, limit);
  if (!ranked.length) return suggestedMembers(userId, m, limit, { exclude: opts.exclude, mutual: error ? undefined : await mutualCounts(supabase) });
  return peopleCards(supabase, ranked);
}

/** Cards (name, business page, logo, place, reason) for members, in the order given. Unknown or blocked members are left out. */
export async function peopleCards(supabase: SupabaseClient, ranked: { user_id: string; reason?: string; detail?: string | null }[]): Promise<Suggestion[]> {
  const ids = ranked.map((r) => r.user_id).slice(0, 50);
  if (!ids.length) return [];
  const v2 = await cardDetails(supabase, ids);
  if (v2) {
    return ranked.flatMap((r) => {
      const c = v2.get(r.user_id);
      if (!c) return [];
      return [{ id: c.id, owner_id: c.id, name: c.business_name ?? c.person_name, slug: c.slug, sector: c.subsector || c.sector, city: c.city, province: c.province,
        chapter_id: c.chapter_id, logo_url: c.logo_url, person_name: c.person_name, business_name: c.business_name, avatar_path: c.avatar_path,
        verified: c.verified, followers: c.followers, mutual: r.reason === "mutual" ? Number(r.detail) || 0 : 0,
        reason: r.reason ? reasonLabel({ reason: r.reason, detail: r.detail ?? null }) : null }];
    });
  }
  const [{ data: cards }, logos] = await Promise.all([
    supabase.rpc("member_cards", { ids }),
    list<{ owner_id: string; logo_url: string | null }>({ table: "businesses", select: "owner_id, logo_url", filters: { ...PUBLIC_BUSINESS_FILTERS, owner_id: ids }, limit: 50 }),
  ]);
  const byId = new Map(((cards ?? []) as Card[]).map((c) => [c.id, c]));
  const logo = new Map(logos.map((l) => [l.owner_id, l.logo_url]));
  return ranked.flatMap((r) => {
    const c = byId.get(r.user_id);
    if (!c) return [];
    return [{ id: c.id, owner_id: c.id, name: c.name, slug: c.slug, sector: c.sector, city: c.city, province: c.province, chapter_id: c.chapter_id,
      logo_url: logo.get(c.id) ?? null, mutual: r.reason === "mutual" ? Number(r.detail) || 0 : 0, reason: r.reason ? reasonLabel({ reason: r.reason, detail: r.detail ?? null }) : null }];
  });
}
