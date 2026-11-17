import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { accountVerificationStatus } from "@/lib/account-verification";
import { DONE_TEXT, type FeedDone } from "@/lib/member-shell";
import { latestFeedAt } from "@/lib/member-shell-data";
import { Notice, buttonClass } from "@/components/ui";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";
import { followingIds, mutualCounts, suggestedMembers } from "@/lib/suggestions";
import { blockedIds, friendLists, mutedIds } from "@/lib/people";
import { memberCompletion } from "@/lib/profile-completion";
import { FeedFocus } from "@/components/shell/FeedFocus";
import { decodeCursor, feedFilters } from "@/lib/feed-rules";
import { activityCards, feedPosts, groupTags, mergeFeed, pageWindow, postExtras, statsOf } from "@/lib/feed-data";
import { PostCard } from "@/components/feed/PostCard";
import { ActivityCard } from "@/components/feed/ActivityCard";
import { FeedFilters } from "@/components/feed/FeedFilters";

export const metadata = { title: "Home" };

type SP = { done?: string; focus?: string; before?: string; industry?: string; chapter?: string; who?: string };

/** The Home feed: the member's landing screen and where every finished action returns. */
export default async function HomeFeed({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, user } = await requireUser("/home");
  const sp = await searchParams;
  const done = sp.done && sp.done in DONE_TEXT ? (sp.done as FeedDone) : null;
  const cursor = decodeCursor(sp.before);

  const [{ data: p }, { data: biz }, { data: verificationData }, { data: chapterRows }, following, latest] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.rpc("account_verification_status"),
    supabase.from("chapters").select("id, name").eq("published", true).order("name").limit(200),
    followingIds(supabase, user.id),
    latestFeedAt(),
  ]);
  const [muted, blocked, friends] = await Promise.all([mutedIds(supabase, user.id), blockedIds(supabase, user.id), friendLists(supabase, user.id)]);
  const chapters = (chapterRows ?? []) as { id: string; name: string }[];
  const filters = feedFilters(sp, chapters.map((c) => c.id));
  const firstPage = !cursor;

  // 1. Profile completion meter with the exact next steps. Shown until everything is done (first page only).
  const verification = accountVerificationStatus(verificationData, user);
  const meter = memberCompletion({ profile: p, business: biz, follows: following.size, emailVerified: verification.email_verified });
  const firstRun = p && "onboarded_at" in p && !p.onboarded_at; // false until the 0016 database update is run

  // 2. Suggested MSMEs to connect with: same chapter, the member's industries, mutual connections, then same province.
  //    Never someone already followed, a Friend, a pending request, muted or blocked.
  const exclude = new Set([...following, ...muted, ...blocked, ...friends.friends, ...friends.sent, ...friends.received]);
  const suggested = firstPage && !filters.industry && !filters.chapter && !filters.following
    ? await suggestedMembers(user.id, { industries: p?.industries, chapter_id: p?.chapter_id, province: biz?.province ?? p?.province, sector: biz?.sector }, 6, { mutual: await mutualCounts(supabase), exclude })
    : [];

  // 3. The feed: one page of member posts (PAGE_SIZE), with the ecosystem activity from the same stretch of time.
  const q = { cursor, ...filters, followIds: following, muted };
  const viewer = { id: user.id, province: biz?.province ?? p?.province, sector: biz?.sector, stage: p?.business_stage, chapter_id: p?.chapter_id, industries: p?.industries };
  const page = await feedPosts(supabase, q);
  const [cards, extras] = await Promise.all([
    activityCards(supabase, viewer, q, pageWindow(cursor?.at ?? null, page.posts, Boolean(page.next))),
    postExtras(supabase, page.posts.map((x) => x.id)),
  ]);
  const groups = await groupTags(supabase, page.posts);
  const entries = mergeFeed(page.posts, cards);

  const keep = new URLSearchParams();
  if (filters.industry) keep.set("industry", filters.industry);
  if (filters.chapter) keep.set("chapter", filters.chapter);
  if (filters.following) keep.set("who", "following");
  const here = `/home${keep.size || sp.before ? `?${new URLSearchParams({ ...Object.fromEntries(keep), ...(sp.before ? { before: sp.before } : {}) })}` : ""}`;
  const older = page.next ? `/home?${new URLSearchParams({ ...Object.fromEntries(keep), before: page.next })}` : null;
  const filterName = [filters.industry, chapters.find((c) => c.id === filters.chapter)?.name, filters.following && "people you follow"].filter(Boolean).join(" · ");

  const first = (p?.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <FeedFocus focus={sp.focus} latest={latest} />
      <h1 className="sr-only">Home feed</h1>
      {done && (
        // Stays in view while the feed scrolls to the result.
        <div role="status" className="sticky top-16 z-30 rounded-xl shadow-md"><Notice tone="ok">{DONE_TEXT[done]}</Notice></div>
      )}

      {firstPage && firstRun && (
        <section aria-labelledby="feed-welcome" className="card border-primary/30 bg-primary-soft p-4 sm:p-5">
          <h2 id="feed-welcome" className="text-lg font-bold">{first ? `Welcome, ${first}!` : "Welcome to FLAME PH!"} Let&apos;s set you up</h2>
          <p className="mt-1 text-sm">Four quick steps: your industries, your chapter, members to follow, and your profile.</p>
          <Link href="/welcome" className={`${buttonClass({ variant: "primary" })} mt-3`}>Start setup</Link>
        </section>
      )}

      {firstPage && !meter.complete && (
        <section aria-labelledby="feed-meter" data-feed="completion" className="card p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="feed-meter" className="text-lg font-bold">{first && !firstRun ? `${first}, your profile is ` : "Your profile is "}{meter.percent}% complete</h2>
            <span className="text-sm text-muted">{meter.done} of {meter.total}</span>
          </div>
          <div role="progressbar" aria-label="Profile completion" aria-valuenow={meter.percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-flame" style={{ width: `${Math.max(4, meter.percent)}%` }} />
          </div>
          <p className="mt-3 text-sm font-semibold">Next steps</p>
          <ul className="mt-1 divide-y divide-line">
            {meter.next.slice(0, 3).map((x) => (
              <li key={x.key}>
                <Link href={x.href} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <span><span className="block font-semibold">{x.label}</span><span className="block text-sm text-muted">{x.help}</span></span>
                  <span aria-hidden className="text-primary">→</span>
                </Link>
              </li>
            ))}
          </ul>
          {meter.next.length > 3 && <p className="mt-1 text-sm text-muted">{meter.next.length - 3} more after these.</p>}
        </section>
      )}

      {firstPage && friends.received.length > 0 && (
        <Link href="/friends#requests" data-feed="friend-requests" className="card flex min-h-14 items-center justify-between gap-3 border-primary/30 bg-primary-soft p-4">
          <span><span className="block font-bold">{friends.received.length} Friend request{friends.received.length === 1 ? "" : "s"}</span><span className="block text-sm text-muted">Accept or decline in Friends</span></span>
          <span aria-hidden className="text-primary">→</span>
        </Link>
      )}

      {suggested.length > 0 && (
        <section aria-labelledby="feed-suggested">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="feed-suggested" className="text-lg font-bold">MSMEs to connect with</h2>
            <Link href="/members" className="text-sm font-semibold text-primary underline">See all</Link>
          </div>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {suggested.map((b) => (
              <li key={b.id} className="w-40 shrink-0 snap-start"><SuggestedMemberCard b={b} following={false} back="/home" /></li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="feed-stream-h" id="feed-stream" className="scroll-mt-24">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="feed-stream-h" className="text-lg font-bold">{cursor ? "Older posts" : "Latest for you"}</h2>
          {cursor && <Link href={keep.size ? `/home?${keep}` : "/home"} className="text-sm font-semibold text-primary underline">Back to newest</Link>}
        </div>
        {firstPage && (
          <Link href="/new-post" className="card mt-3 flex min-h-14 items-center gap-3 p-3 text-muted hover:border-primary">
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">✎</span>
            <span>Share an update, a question or an offer…</span>
          </Link>
        )}
        <div className="mt-3"><FeedFilters industry={filters.industry} chapter={filters.chapter} following={filters.following} chapters={chapters} myChapter={p?.chapter_id} /></div>
        {filterName && <p className="mt-2 text-sm text-muted" role="status">Showing posts and activity for: <strong className="text-fg">{filterName}</strong></p>}
        {!page.available && (
          <p className="mt-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Member posts open after FLAME PH finishes a database update. Your feed shows group orders, opportunities, events and Negosyo News meanwhile.</p>
        )}
        {entries.length === 0 ? (
          <div className="card mt-3 p-5">
            <p className="font-semibold">{filterName ? "Nothing here yet for this filter." : "Nothing new yet."}</p>
            <p className="mt-1 text-sm text-muted">Be the first to post{filters.industry ? ` in ${filters.industry}` : ""}.</p>
            <Link href={`/new-post${filters.industry ? `?industry=${encodeURIComponent(filters.industry)}` : ""}`} className={`${buttonClass({ variant: "primary" })} mt-3`}>Write a post</Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-3" aria-label="Feed">
            {entries.map((e) => (
              <li key={e.type === "post" ? e.post.id : e.card.id}>
                {e.type === "post"
                  ? <PostCard post={e.post} stats={statsOf(extras.stats, e.post.id)} comments={extras.comments.get(e.post.id) ?? []} viewerId={user.id} back={here} group={e.post.group_id ? groups.get(e.post.group_id) : null} />
                  : <ActivityCard card={e.card} back={`${here}${here.includes("?") ? "&" : "?"}focus=${e.card.id}`} />}
              </li>
            ))}
          </ul>
        )}
        {older && <Link href={older} className={`${buttonClass({ variant: "outline", block: true })} mt-4`} rel="next">Show older posts</Link>}
      </section>
    </div>
  );
}
