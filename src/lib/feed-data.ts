import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPPORTUNITY_KINDS, type Opportunity, dateLabel, matches, notExpired, peso } from "@/lib/growth";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { PAGE_SIZE, encodeCursor, type PostKind, type ReactionKind } from "@/lib/feed-rules";

export type FeedPost = {
  id: string; author_id: string; kind: PostKind; category: string; subcategory: string | null; body: string; chapter_id: string | null;
  author_name: string | null; author_slug: string | null; status: "published" | "held" | "hidden"; held_reason: string | null; created_at: string;
  audience?: "members" | "friends"; group_id?: string | null;
};
export type PostStats = { likes: number; loves: number; helpful: number; comments: number; mine: ReactionKind | null };
export type FeedComment = { id: string; post_id: string; author_id: string; body: string; author_name: string | null; author_slug: string | null; created_at: string };

/** A card for something that happened elsewhere on FLAME PH. href opens the tab that owns it. */
export type ActivityCard = {
  id: string; at: string; kind: string; title: string; sub?: string; text?: string | null; href: string; cta: string; badge?: string;
  follow?: { memberId: string; name: string; following: boolean };
};
export type FeedEntry = { type: "post"; at: string; post: FeedPost } | { type: "activity"; at: string; card: ActivityCard };

const BASE_COLUMNS = "id, author_id, kind, category, subcategory, body, chapter_id, author_name, author_slug, status, held_reason, created_at";
/** With the audience (all members or friends only) and group from the 0018 update. */
export const POST_COLUMNS = `${BASE_COLUMNS}, audience, group_id`;
/** True when a query failed only because the 0018 columns are not in the database yet. */
export const missing0018 = (e: { message?: string } | null) => Boolean(e && /audience|group_id/.test(e.message ?? ""));
const EMPTY: PostStats = { likes: 0, loves: 0, helpful: 0, comments: 0, mine: null };
const SOURCE_LIMIT = 6; // each activity source adds at most this many cards to one page
const DAY = 86400000;

export type Viewer = { id: string; province?: string | null; sector?: string | null; stage?: string | null; chapter_id?: string | null; industries?: string[] | null };
export type FeedQuery = {
  cursor: { at: string; id: string } | null; industry: string | null; chapter: string | null; following: boolean; followIds: Set<string>;
  group?: string | null; muted?: Set<string>;
};

/** Counts, the viewer's own reaction and the newest comments for one page of posts. Two bounded calls, whatever the page holds. */
export async function postExtras(supabase: SupabaseClient, ids: string[], perPost = 2) {
  if (!ids.length) return { stats: new Map<string, PostStats>(), comments: new Map<string, FeedComment[]>() };
  const [{ data: s }, { data: c }] = await Promise.all([
    supabase.rpc("feed_post_stats", { ids }),
    perPost > 0 ? supabase.rpc("feed_recent_comments", { ids, per_post: perPost }) : Promise.resolve({ data: [] }),
  ]);
  const stats = new Map<string, PostStats>(((s ?? []) as (PostStats & { post_id: string })[]).map((r) => [r.post_id, { ...EMPTY, ...r }]));
  const comments = new Map<string, FeedComment[]>();
  for (const r of ((c ?? []) as FeedComment[]).sort((a, b) => a.created_at.localeCompare(b.created_at))) comments.set(r.post_id, [...(comments.get(r.post_id) ?? []), r]);
  return { stats, comments };
}
export const statsOf = (m: Map<string, PostStats>, id: string) => m.get(id) ?? EMPTY;

/** One page of member posts, newest first, PAGE_SIZE at a time. available is false until the 0017 database update is run. */
export async function feedPosts(supabase: SupabaseClient, q: FeedQuery, pageSize = PAGE_SIZE) {
  if (q.following && q.followIds.size === 0) return { posts: [] as FeedPost[], next: null as string | null, available: true };
  let hideInGroup = Boolean(q.group); // posts a moderator hid in the group (0019) stay out of the group page
  const build = (cols: string) => {
    let req = supabase.from("feed_posts").select(cols).neq("status", "hidden")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
    if (q.cursor) req = req.or(`created_at.lt.${q.cursor.at},and(created_at.eq.${q.cursor.at},id.lt.${q.cursor.id})`);
    if (q.industry) req = req.eq("category", q.industry);
    if (q.chapter) req = req.eq("chapter_id", q.chapter);
    if (q.group) req = req.eq("group_id", q.group);
    if (hideInGroup) req = req.eq("group_hidden", false);
    if (q.following) req = req.in("author_id", [...q.followIds].slice(0, 500));
    // Muted members' posts stay out of this member's feed (they can still be opened directly).
    if (q.muted?.size) req = req.not("author_id", "in", `(${[...q.muted].slice(0, 500).join(",")})`);
    return req;
  };
  let { data, error } = await build(POST_COLUMNS);
  if (hideInGroup && error && /group_hidden/.test(error.message)) { hideInGroup = false; ({ data, error } = await build(POST_COLUMNS)); }
  if (missing0018(error)) {
    if (q.group) return { posts: [] as FeedPost[], next: null, available: false };
    ({ data, error } = await build(BASE_COLUMNS));
  }
  if (error) return { posts: [] as FeedPost[], next: null, available: false };
  const rows = (data ?? []) as unknown as FeedPost[];
  const posts = rows.slice(0, pageSize);
  const last = posts[posts.length - 1];
  return { posts, next: rows.length > pageSize && last ? encodeCursor(last.created_at, last.id) : null, available: true };
}

const eventTab = (type: string) =>
  type === "webinar" || type === "training" ? "/trainings-webinars" : type === "expo" || type === "summit" ? "/expos-summits" : type === "talk" ? "/negosyo-talks" : "/workshops";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
const quote = (v: string) => `"${v.replace(/"/g, "")}"`;

/**
 * Ecosystem activity for the stretch of time one feed page covers (newer than `from`, up to `to`).
 * Every source is one query with a time window and a small limit, so a page never loads more than a few dozen rows.
 */
export async function activityCards(supabase: SupabaseClient, viewer: Viewer, q: FeedQuery, window: { from: string; to: string | null }): Promise<ActivityCard[]> {
  if (q.following) return []; // "People I follow" shows their posts only
  const filtered = Boolean(q.industry || q.chapter);
  const inWindow = <T extends { gt: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(r: T, col = "created_at") => {
    const a = r.gt(col, window.from);
    return window.to ? a.lte(col, window.to) : a;
  };
  const cards: ActivityCard[] = [];
  const today = new Date().toISOString();

  // Interests for "new members in your chapter or industry".
  const wanted = q.industry ? [q.industry] : [...new Set([...(viewer.industries ?? []), ...(viewer.sector ? [viewer.sector] : [])])];
  const chapter = q.chapter ?? (q.industry ? null : viewer.chapter_id ?? null);
  const memberOr = [chapter && `chapter_id.eq.${chapter}`, wanted.length && `sector.in.(${wanted.map(quote).join(",")})`].filter(Boolean).join(",");

  const [deals, mine, opps, events, courses, news, members] = await Promise.all([
    filtered ? null : inWindow(supabase.from("deals").select("id, title, supplier, unit, deal_price, deadline, status, created_at").eq("published", true).eq("status", "open")).order("created_at", { ascending: false }).limit(SOURCE_LIMIT),
    filtered ? null : supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", viewer.id).limit(200),
    q.chapter ? null : (() => {
      let r = inWindow(supabase.from("opportunities").select("*").eq("published", true));
      if (q.industry) r = r.contains("sectors", [q.industry]);
      return r.order("created_at", { ascending: false }).limit(SOURCE_LIMIT);
    })(),
    q.industry ? null : (() => {
      let r = inWindow(supabase.from("events").select("id, title, type, starts_at, city, status, created_at, chapter_id").eq("published", true).eq("status", "scheduled").gt("starts_at", today));
      if (q.chapter) r = r.eq("chapter_id", q.chapter);
      return r.order("created_at", { ascending: false }).limit(SOURCE_LIMIT);
    })(),
    filtered ? null : inWindow(supabase.from("courses").select("id, title, summary, stage, created_at").eq("published", true)).order("created_at", { ascending: false }).limit(SOURCE_LIMIT),
    filtered ? null : inWindow(supabase.from("posts").select("id, title, slug, excerpt, published_at").eq("published", true), "published_at").order("published_at", { ascending: false }).limit(SOURCE_LIMIT),
    !memberOr ? null : (() => {
      let r = inWindow(supabase.from("businesses").select("id, owner_id, name, slug, sector, city, province, chapter_id, created_at").match(PUBLIC_BUSINESS_FILTERS).neq("owner_id", viewer.id));
      r = r.or(memberOr);
      return r.order("created_at", { ascending: false }).limit(SOURCE_LIMIT);
    })(),
  ]);

  const joined = new Map(((mine?.data ?? []) as { deal_id: string; quantity: number }[]).map((m) => [m.deal_id, m.quantity]));
  for (const d of (deals?.data ?? []) as { id: string; title: string; supplier: string | null; unit: string | null; deal_price: number | null; deadline: string | null; created_at: string }[]) {
    if (!notExpired(d.deadline)) continue;
    cards.push({
      id: `deal-${d.id}`, at: d.created_at, kind: "Group order", title: d.title,
      sub: [d.supplier && `Supplier: ${d.supplier}`, d.deal_price !== null && `${peso(d.deal_price)}${d.unit ? ` / ${d.unit}` : ""}`, d.deadline && `join by ${dateLabel(d.deadline)}`].filter(Boolean).join(" · "),
      href: `/group-order#deal-${d.id}`, cta: joined.has(d.id) ? "See it in Group Order" : "Join in Group Order",
      badge: joined.has(d.id) ? `You joined (${joined.get(d.id)})` : "Open to join",
    });
  }
  const member = { province: viewer.province, sector: viewer.sector, stage: viewer.stage };
  for (const o of (opps?.data ?? []) as Opportunity[]) {
    if (!notExpired(o.deadline)) continue;
    cards.push({
      id: `opp-${o.id}`, at: o.created_at, kind: OPPORTUNITY_KINDS[o.kind] ?? "Opportunity", title: o.title,
      sub: [o.organizer, o.deadline && `apply by ${dateLabel(o.deadline)}`].filter(Boolean).join(" · "), text: o.summary,
      href: `/opportunities#opp-${o.id}`, cta: "Open in Opportunities", badge: matches(o, member) ? "Fits you" : undefined,
    });
  }
  for (const e of (events?.data ?? []) as { id: string; title: string; type: string; starts_at: string; city: string | null; created_at: string; chapter_id: string | null }[]) {
    const training = e.type === "webinar" || e.type === "training";
    cards.push({
      id: `event-${e.id}`, at: e.created_at, kind: training ? "Training" : "Event", title: e.title,
      sub: `${day(e.starts_at)}${e.city ? ` · ${e.city}` : ""}`, href: eventTab(e.type), cta: "See details and register",
      badge: viewer.chapter_id && e.chapter_id === viewer.chapter_id ? "Your chapter" : undefined,
    });
  }
  for (const c of (courses?.data ?? []) as { id: string; title: string; summary: string | null; created_at: string }[]) {
    cards.push({ id: `course-${c.id}`, at: c.created_at, kind: "Academy", title: c.title, text: c.summary, href: "/academy", cta: "Open in Academy", badge: "New course" });
  }
  for (const n of (news?.data ?? []) as { id: string; title: string; slug: string; excerpt: string | null; published_at: string | null }[]) {
    if (!n.published_at) continue;
    cards.push({ id: `news-${n.slug}`, at: n.published_at, kind: "Negosyo News", title: n.title, sub: day(n.published_at), text: n.excerpt, href: `/news/${n.slug}`, cta: "Read on the blog" });
  }
  const seen = new Set<string>();
  for (const b of (members?.data ?? []) as { id: string; owner_id: string; name: string; slug: string; sector: string | null; city: string | null; province: string | null; chapter_id: string | null; created_at: string }[]) {
    if (seen.has(b.owner_id) || q.muted?.has(b.owner_id)) continue;
    seen.add(b.owner_id);
    const sameChapter = Boolean(chapter && b.chapter_id === chapter);
    cards.push({
      id: `member-${b.id}`, at: b.created_at, kind: "New member", title: b.name,
      sub: [sameChapter ? (q.chapter ? "Joined this chapter" : "Joined your chapter") : b.sector ? `New in ${b.sector}` : null, [b.city, b.province].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      href: `/members/${b.slug}`, cta: "View profile", follow: { memberId: b.owner_id, name: b.name, following: q.followIds.has(b.owner_id) },
    });
  }
  return cards;
}

/** Posts and activity cards in one timeline, newest first. */
export function mergeFeed(posts: FeedPost[], cards: ActivityCard[]): FeedEntry[] {
  return [
    ...posts.map((post) => ({ type: "post" as const, at: post.created_at, post })),
    ...cards.map((card) => ({ type: "activity" as const, at: card.at, card })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/** The stretch of time a feed page covers: from the oldest post on it (or 60 days back on the last page) to the cursor. */
export function pageWindow(cursorAt: string | null, posts: FeedPost[], hasMore: boolean, now = Date.now()) {
  const to = cursorAt;
  const top = cursorAt ? new Date(cursorAt).getTime() : now;
  const from = hasMore && posts.length ? posts[posts.length - 1].created_at : new Date(top - 60 * DAY).toISOString();
  return { from, to };
}

/** One post by id (null when it doesn't exist or the viewer may not see it, e.g. a Friend-only post of a non-friend). */
export async function getPost(supabase: SupabaseClient, id: string): Promise<FeedPost | null> {
  const one = (cols: string) => supabase.from("feed_posts").select(cols).eq("id", id).neq("status", "hidden").maybeSingle();
  let { data, error } = await one(POST_COLUMNS);
  if (missing0018(error)) ({ data, error } = await one(BASE_COLUMNS));
  return error ? null : ((data as unknown as FeedPost | null) ?? null);
}

export type GroupTag = { slug: string; name: string };
/** Names of the groups the given posts were posted in (for the group tag on each post). */
export async function groupTags(supabase: SupabaseClient, posts: FeedPost[]): Promise<Map<string, GroupTag>> {
  const ids = [...new Set(posts.map((p) => p.group_id).filter((g): g is string => Boolean(g)))].slice(0, 50);
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("community_groups").select("id, slug, name").in("id", ids);
  return new Map((error ? [] : data ?? []).map((g) => [g.id as string, { slug: g.slug as string, name: g.name as string }]));
}
