import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogEntry, Group } from "@/lib/groups";

const COLS = "id, slug, kind, name, sector, chapter_id, priority";

/** Every open group, the catalogue of industries that can be opened, the viewer's memberships and member counts.
 *  available is false before the 0018 database update. All lists are bounded. */
export async function groupDirectory(supabase: SupabaseClient, me: string) {
  const [g, c, m] = await Promise.all([
    supabase.from("community_groups").select(COLS).order("priority", { ascending: false }).order("name").limit(200),
    supabase.from("group_catalog").select("slug, name, sector, priority, sort").order("sort").limit(100),
    supabase.from("group_members").select("group_id").eq("user_id", me).limit(200),
  ]);
  const groups = (g.error ? [] : g.data ?? []) as Group[];
  const counts = await groupCounts(supabase, groups.map((x) => x.id));
  return {
    available: !g.error,
    groups,
    catalog: (c.error ? [] : c.data ?? []) as CatalogEntry[],
    mine: new Set((m.error ? [] : m.data ?? []).map((r) => r.group_id as string)),
    counts,
  };
}

export async function groupCounts(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc("group_counts", { ids: ids.slice(0, 100) });
  return new Map((error ? [] : (data ?? []) as { group_id: string; members: number }[]).map((r) => [r.group_id, r.members]));
}

/** One group by its address, and whether the viewer is in it. */
export async function getGroup(supabase: SupabaseClient, slug: string, me: string) {
  const { data, error } = await supabase.from("community_groups").select(COLS).eq("slug", slug).maybeSingle();
  if (error || !data) return { group: null, member: false, available: !error };
  const group = data as Group;
  const [{ data: m }, counts] = await Promise.all([
    supabase.from("group_members").select("group_id").eq("group_id", group.id).eq("user_id", me).maybeSingle(),
    groupCounts(supabase, [group.id]),
  ]);
  return { group, member: Boolean(m), available: true, members: counts.get(group.id) ?? 0 };
}
