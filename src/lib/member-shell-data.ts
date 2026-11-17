import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/auth";
import { list } from "@/lib/content";

/** The signed-in member for the shell, once per request (the layout and the page share it). */
export const shellSession = cache(getSession);

/** Unread messages: new inquiries on the member's business page (same count as the Inquiries tab). */
export async function unreadMessages(): Promise<number> {
  const { supabase, user } = await shellSession();
  if (!supabase || !user) return 0;
  const { count } = await supabase.from("business_inquiries").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "new");
  return count ?? 0;
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
