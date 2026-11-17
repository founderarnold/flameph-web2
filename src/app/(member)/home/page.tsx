import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { list } from "@/lib/content";
import { OPPORTUNITY_KINDS, type Opportunity, dateLabel, matches, notExpired } from "@/lib/growth";
import { accountVerificationStatus } from "@/lib/account-verification";
import { DONE_TEXT, type FeedDone } from "@/lib/member-shell";
import { latestFeedAt } from "@/lib/member-shell-data";
import { Notice, buttonClass } from "@/components/ui";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";
import { followingIds, suggestedMembers } from "@/lib/suggestions";
import { memberCompletion } from "@/lib/profile-completion";
import { FeedFocus } from "@/components/shell/FeedFocus";

export const metadata = { title: "Home" };

type Deal = { id: string; title: string; supplier: string | null; deadline: string | null; status: string; target_members: number; created_at: string };
type EventRow = { id: string; title: string; slug: string | null; starts_at: string; city: string | null; type: string; status: string; created_at?: string };
type Post = { id: string; title: string; slug: string; excerpt: string | null; published_at: string | null };
type Item = { id: string; at: number; kind: string; title: string; sub?: string; text?: string | null; href: string; external?: boolean; badge?: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

/** The Home feed: the member's landing screen and where every finished action returns. */
export default async function HomeFeed({ searchParams }: { searchParams: Promise<{ done?: string; focus?: string }> }) {
  const { supabase, user } = await requireUser("/home");
  const sp = await searchParams;
  const done = sp.done && sp.done in DONE_TEXT ? (sp.done as FeedDone) : null;

  const [{ data: p }, { data: biz }, { data: verificationData }, { data: opps }, { data: deals }, { data: mine }, events, posts, following, latest] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("businesses").select("*").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.rpc("account_verification_status"),
    supabase.from("opportunities").select("*").eq("published", true).order("created_at", { ascending: false }).limit(50),
    supabase.from("deals").select("id, title, supplier, deadline, status, target_members, created_at").eq("published", true).neq("status", "closed").order("created_at", { ascending: false }).limit(10),
    supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", user.id),
    list<EventRow>({ table: "events", select: "id,title,slug,starts_at,city,type,status,created_at", order: "starts_at", ascending: true }),
    list<Post>({ table: "posts", select: "id,title,slug,excerpt,published_at", order: "published_at", limit: 5 }),
    followingIds(supabase, user.id),
    latestFeedAt(),
  ]);

  // 1. Profile completion meter with the exact next steps. Shown until everything is done.
  const verification = accountVerificationStatus(verificationData, user);
  const meter = memberCompletion({ profile: p, business: biz, follows: following.size, emailVerified: verification.email_verified });
  const firstRun = p && "onboarded_at" in p && !p.onboarded_at; // false until the 0016 database update is run

  // 2. Suggested MSMEs to follow: same chapter, then the member's industries, then same province.
  const suggested = (await suggestedMembers(user.id, { industries: p?.industries, chapter_id: p?.chapter_id, province: biz?.province ?? p?.province, sector: biz?.sector }, 10))
    .filter((b) => !following.has(b.owner_id)).slice(0, 6);

  // 3. The post stream. Newest first. Every item has an id so a finished action can scroll to it.
  const joined = new Map(((mine ?? []) as { deal_id: string; quantity: number }[]).map((m) => [m.deal_id, m.quantity]));
  const member = { province: biz?.province ?? p?.province, sector: biz?.sector, stage: p?.business_stage };
  const stream: Item[] = [
    ...((opps ?? []) as Opportunity[]).filter((o) => notExpired(o.deadline)).map((o) => ({
      id: `opp-${o.id}`, at: new Date(o.created_at).getTime(), kind: OPPORTUNITY_KINDS[o.kind] ?? "Opportunity", title: o.title,
      sub: [o.organizer, o.deadline && `apply by ${dateLabel(o.deadline)}`].filter(Boolean).join(" · "), text: o.summary,
      href: "/opportunities", badge: matches(o, member) ? "Fits you" : undefined,
    })),
    ...((deals ?? []) as Deal[]).map((d) => ({
      id: `deal-${d.id}`, at: new Date(d.created_at).getTime(), kind: "Group order", title: d.title,
      sub: [d.supplier && `Supplier: ${d.supplier}`, d.deadline && `join by ${dateLabel(d.deadline)}`].filter(Boolean).join(" · "),
      href: `/deals#deal-${d.id}`, badge: joined.has(d.id) ? `You joined (${joined.get(d.id)})` : d.status === "reached" ? "Target reached" : undefined,
    })),
    ...events.filter((e) => e.status === "scheduled" && new Date(e.starts_at).getTime() > Date.now()).slice(0, 5).map((e) => ({
      id: `event-${e.id}`, at: new Date(e.created_at ?? e.starts_at).getTime(), kind: e.type === "webinar" || e.type === "training" ? "Training" : "Event", title: e.title,
      sub: `${day(e.starts_at)}${e.city ? ` · ${e.city}` : ""}`, href: e.type === "webinar" || e.type === "training" ? "/trainings-webinars" : "/workshops",
    })),
    ...posts.map((n) => ({
      id: `news-${n.slug}`, at: n.published_at ? new Date(n.published_at).getTime() : 0, kind: "Negosyo News", title: n.title,
      sub: n.published_at ? day(n.published_at) : undefined, text: n.excerpt, href: `/news/${n.slug}`,
    })),
  ].sort((a, b) => b.at - a.at);

  const first = (p?.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <FeedFocus focus={sp.focus} latest={latest} />
      <h1 className="sr-only">Home feed</h1>
      {done && (
        // Stays in view while the feed scrolls to the result.
        <div role="status" className="sticky top-16 z-30 rounded-xl shadow-md"><Notice tone="ok">{DONE_TEXT[done]}</Notice></div>
      )}

      {firstRun && (
        <section aria-labelledby="feed-welcome" className="card border-primary/30 bg-primary-soft p-4 sm:p-5">
          <h2 id="feed-welcome" className="text-lg font-bold">{first ? `Welcome, ${first}!` : "Welcome to FLAME PH!"} Let&apos;s set you up</h2>
          <p className="mt-1 text-sm">Four quick steps: your industries, your chapter, members to follow, and your profile.</p>
          <Link href="/welcome" className={`${buttonClass({ variant: "primary" })} mt-3`}>Start setup</Link>
        </section>
      )}

      {!meter.complete && (
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

      <section aria-labelledby="feed-stream">
        <h2 id="feed-stream" className="text-lg font-bold">Latest for you</h2>
        <div className="mt-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          Member posts are coming soon. For now your feed shows opportunities, group orders, events and Negosyo News.{" "}
          <Link href="/new-post" className="font-semibold text-primary underline">New Post</Link>
        </div>
        {stream.length === 0 ? (
          <p className="mt-4 text-muted">Nothing new yet. Check back soon.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {stream.map((it) => (
              <li key={it.id} id={it.id} className="card scroll-mt-24 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-bg-soft px-2.5 py-0.5 text-muted">{it.kind}</span>
                  {it.badge && <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-ok">{it.badge}</span>}
                </div>
                <h3 className="mt-2 font-bold"><Link href={it.href} className="hover:underline">{it.title}</Link></h3>
                {it.sub && <p className="text-sm text-muted">{it.sub}</p>}
                {it.text && <p className="mt-1 line-clamp-3 text-[15px]">{it.text}</p>}
                <Link href={it.href} className={`${buttonClass({ variant: "ghost", size: "sm" })} mt-2 -ml-2`}>Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
