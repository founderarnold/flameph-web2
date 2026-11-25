import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POINTS } from "@/lib/growth";

/**
 * Saves reward milestones the member doesn't have yet, with the member's own session (row level security: a member
 * may only write their own). Each counts POINTS.milestone in member_points. Returns how many points that added.
 */
export async function awardMilestones(supabase: SupabaseClient, userId: string, keys: string[]): Promise<number> {
  if (!keys.length) return 0;
  const { data: have } = await supabase.from("member_milestones").select("key").eq("user_id", userId).in("key", keys);
  const fresh = keys.filter((k) => !(have ?? []).some((h: { key: string }) => h.key === k));
  if (!fresh.length) return 0;
  const { error } = await supabase.from("member_milestones").upsert(fresh.map((key) => ({ user_id: userId, key })), { onConflict: "user_id,key", ignoreDuplicates: true });
  return error ? 0 : fresh.length * POINTS.milestone;
}
