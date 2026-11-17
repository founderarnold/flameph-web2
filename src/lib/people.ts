import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Follow (one-way, open), Friend (mutual, both accept), mute and block. The database enforces every rule;
// these helpers only read what the signed-in member is allowed to see.

export type FriendState = "none" | "friends" | "sent" | "received";
export type Relationship = { following: boolean; friend: FriendState; muted: boolean; blocked: boolean; available: boolean };
export type MemberCard = { id: string; name: string; slug: string | null; sector: string | null; city: string | null; province: string | null; chapter_id: string | null };

/** How the viewer is connected to one other member. Before the 0018 database update, only Follow is known. */
export async function relationship(supabase: SupabaseClient, me: string, other: string): Promise<Relationship> {
  const [f, fr, mu, bl] = await Promise.all([
    supabase.from("member_follows").select("followee_id").eq("follower_id", me).eq("followee_id", other).maybeSingle(),
    supabase.from("friendships").select("requester_id, status").or(`and(requester_id.eq.${me},addressee_id.eq.${other}),and(requester_id.eq.${other},addressee_id.eq.${me})`).maybeSingle(),
    supabase.from("member_mutes").select("muted_id").eq("muter_id", me).eq("muted_id", other).maybeSingle(),
    supabase.from("member_blocks").select("blocked_id").eq("blocker_id", me).eq("blocked_id", other).maybeSingle(),
  ]);
  const row = fr.data as { requester_id: string; status: string } | null;
  const friend: FriendState = !row ? "none" : row.status === "accepted" ? "friends" : row.requester_id === me ? "sent" : "received";
  return { following: Boolean(f.data), friend, muted: Boolean(mu.data), blocked: Boolean(bl.data), available: !fr.error };
}

/** Members the viewer has muted (their posts are left out of the viewer's feed). Empty before the 0018 update. */
export async function mutedIds(supabase: SupabaseClient, me: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("member_mutes").select("muted_id").eq("muter_id", me).limit(500);
  return new Set(error ? [] : (data ?? []).map((r) => r.muted_id as string));
}

/** The viewer's friends, sent and received requests (newest first, bounded). */
export async function friendLists(supabase: SupabaseClient, me: string) {
  const { data, error } = await supabase.from("friendships").select("requester_id, addressee_id, status, created_at")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`).order("created_at", { ascending: false }).limit(500);
  const rows = (error ? [] : data ?? []) as { requester_id: string; addressee_id: string; status: string; created_at: string }[];
  const other = (r: (typeof rows)[number]) => (r.requester_id === me ? r.addressee_id : r.requester_id);
  return {
    available: !error,
    friends: rows.filter((r) => r.status === "accepted").map(other),
    received: rows.filter((r) => r.status === "pending" && r.addressee_id === me).map(other),
    sent: rows.filter((r) => r.status === "pending" && r.requester_id === me).map(other),
  };
}

/** Pending Friend requests waiting for the viewer. */
export async function pendingRequests(supabase: SupabaseClient, me: string): Promise<number> {
  const { count, error } = await supabase.from("friendships").select("requester_id", { count: "exact", head: true }).eq("addressee_id", me).eq("status", "pending");
  return error ? 0 : count ?? 0;
}

/** Names and profile addresses for up to 100 members (never contact details). */
export async function memberCards(supabase: SupabaseClient, ids: string[]): Promise<Map<string, MemberCard>> {
  const unique = [...new Set(ids)].slice(0, 100);
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc("member_cards", { ids: unique });
  return new Map((error ? [] : (data ?? []) as MemberCard[]).map((c) => [c.id, c]));
}

/** Members the viewer has blocked. Empty before the 0018 update. */
export async function blockedIds(supabase: SupabaseClient, me: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("member_blocks").select("blocked_id").eq("blocker_id", me).limit(500);
  return new Set(error ? [] : (data ?? []).map((r) => r.blocked_id as string));
}
