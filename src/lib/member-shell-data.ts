import "server-only";
import { cache } from "react";
import { getSession, isStaffRole } from "@/lib/auth";
import { list, mediaUrl } from "@/lib/content";
import { roleLinks, type MenuMember } from "@/lib/mobile-menu";
import { recordsWaiting } from "@/lib/records-server";

/** The signed-in member for the shell, once per request (the layout and the page share it). */
export const shellSession = cache(getSession);

/**
 * Unread member-to-member messages (top-bar Messages icon). Before the 0021 database update there are no messages yet,
 * so this is 0 and leads keep their own count on the Inbox icon.
 */
export async function unreadMessages(): Promise<number> {
  const { supabase, user } = await shellSession();
  if (!supabase || !user) return 0;
  const { data, error } = await supabase.rpc("unread_direct_messages");
  return error ? 0 : Number(data) || 0;
}

/**
 * Business inbox count (top-bar Inbox icon): new leads and quote requests, Friend requests waiting for an answer, and
 * member requests and transaction records waiting for this member (0 before the 0022 update).
 */
export async function inboxCount(): Promise<number> {
  const { supabase, user } = await shellSession();
  if (!supabase || !user) return 0;
  const [leads, requests, records] = await Promise.all([
    supabase.from("business_inquiries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "new"),
    supabase.from("friendships").select("requester_id", { count: "exact", head: true }).eq("addressee_id", user.id).eq("status", "pending"),
    recordsWaiting(supabase, user.id),
  ]);
  return (leads.count ?? 0) + (requests.error ? 0 : requests.count ?? 0) + records;
}

type Stamp = { created_at?: string | null; published_at?: string | null };

/** Time of the newest item in the feed. The Home button shows a dot when it is newer than what this phone last saw. */
export async function latestFeedAt(): Promise<string | null> {
  const { supabase, user } = await shellSession();
  const [opps, deals, posts, member] = await Promise.all([
    list<Stamp>({ table: "opportunities", select: "created_at", filters: { published: true }, order: "created_at", limit: 1 }),
    list<Stamp>({ table: "deals", select: "created_at", filters: { published: true }, order: "created_at", limit: 1 }),
    list<Stamp>({ table: "posts", select: "published_at", filters: { published: true }, order: "published_at", limit: 1 }),
    // The newest member post by someone else. One row; empty until the 0017 database update is run.
    supabase && user
      ? supabase.from("feed_posts").select("created_at").eq("status", "published").neq("author_id", user.id).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as Stamp[] }),
  ]);
  const newest = ((member as { data: Stamp[] | null }).data ?? [])[0]?.created_at;
  const times = [opps[0]?.created_at, deals[0]?.created_at, posts[0]?.published_at, newest].filter(Boolean).map((t) => new Date(t as string).getTime()).filter((n) => !Number.isNaN(n));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/**
 * What the phone menu shows about the member: name, photo, tier and the dashboards their roles open. Two small reads,
 * made with the page (in parallel with the counts above), so opening the menu needs no database call.
 */
export async function menuMember(): Promise<MenuMember | null> {
  const { supabase, user, roles } = await shellSession();
  if (!supabase || !user) return null;
  const [profile, partner] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_path, tier").eq("id", user.id).maybeSingle(),
    supabase.from("partner_profiles").select("status").eq("user_id", user.id).maybeSingle(),
  ]);
  const p = (profile.data ?? {}) as { full_name?: string | null; avatar_path?: string | null; tier?: string | null };
  const tier = (p.tier || "free").replace(/^\w/, (c) => c.toUpperCase());
  const accredited = !partner.error && (partner.data as { status?: string } | null)?.status === "accredited";
  return {
    name: p.full_name?.trim() || (user.email ?? "Member").split("@")[0],
    avatar: p.avatar_path ? mediaUrl(p.avatar_path) ?? null : null,
    tier,
    staff: isStaffRole(roles),
    roleLinks: roleLinks({ roles, accredited }),
  };
}
