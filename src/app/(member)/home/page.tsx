import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { list, mediaUrl } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { OPPORTUNITY_KINDS, type Opportunity, dateLabel, matches, notExpired } from "@/lib/growth";
import { accountVerificationStatus } from "@/lib/account-verification";
import { DONE_TEXT, type FeedDone } from "@/lib/member-shell";
import { latestFeedAt } from "@/lib/member-shell-data";
import { Avatar, Notice, buttonClass } from "@/components/ui";
import { FeedFocus } from "@/components/shell/FeedFocus";

export const metadata = { title: "Home" };

type Biz = { id: string; name: string; slug: string; sector: string | null; city: string | null; province: string | null; logo_url: string | null; owner_id?: string | null };
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

  const [{ data: p }, { data: biz }, { data: verificationData }, { data: opps }, { data: deals }, { data: mine }, events, posts, businesses, latest] = await Promise.all([
    supabase.from("profiles").select("full_name, province, city, business_stage").eq("id", user.id).single(),
    supabase.from("businesses").select("id, sector, province").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.rpc("account_verification_status"),
    supabase.from("opportunities").select("*").eq("published", true).order("created_at", { ascending: false }).limit(50),
    supabase.from("deals").select("id, title, supplier, deadline, status, target_members, created_at").eq("published", true).neq("status", "closed").order("created_at", { ascending: false }).limit(10),
    supabase.from("deal_participants").select("deal_id, quantity").eq("user_id", user.id),
    list<EventRow>({ table: "events", select: "id,title,slug,starts_at,city,type,status,created_at", order: "starts_at", ascending: true }),
    list<Post>({ table: "posts", select: "id,title,slug,excerpt,published_at", order: "published_at", limit: 5 }),
    list<Biz>({ table: "businesses", select: "id,name,slug,sector,city,province,logo_url", filters: PUBLIC_BUSINESS_FILTERS, order: "created_at", limit: 60 }),
    latestFeedAt(),
  ]);

  // 1. Profile completion prompts (only what is still missing).
  const verification = accountVerificationStatus(verificationData, user);
  const prompts = [
    !verification.email_verified && { href: "/account/business", label: "Confirm your email", why: "So members and buyers can trust your listing." },
    (!p?.full_name || !p?.province || !p?.city || !p?.business_stage) && { href: "/account/profile?welcome=1", label: "Complete your profile", why: "Add your name, where you are and your business stage, so we can match you with nearby MSMEs and the right opportunities." },
    !biz && { href: "/account/business", label: "List your business (free)", why: "Get your own page in the FLAME PH directory." },
  ].filter(Boolean) as { href: string; label: string; why: string }[];

  // 2. Suggested MSMEs: same province or sector first, never the member's own business.
  const where = { province: (biz?.province ?? p?.province ?? "").toLowerCase(), sector: (biz?.sector ?? "").toLowerCase() };
  const score = (b: Biz) => (where.province && b.province?.toLowerCase() === where.province ? 2 : 0) + (where.sector && b.sector?.toLowerCase() === where.sector ? 1 : 0);
  const suggested = businesses.filter((b) => b.id !== biz?.id).sort((a, b) => score(b) - score(a)).slice(0, 6);

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

      {prompts.length > 0 && (
        <section aria-labelledby="feed-prompts" className="card p-4 sm:p-5">
          <h2 id="feed-prompts" className="text-lg font-bold">{first ? `Hi ${first}! ` : ""}Finish setting up</h2>
          <ul className="mt-2 divide-y divide-line">
            {prompts.slice(0, 3).map((x) => (
              <li key={x.href + x.label}>
                <Link href={x.href} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                  <span><span className="block font-semibold">{x.label}</span><span className="block text-sm text-muted">{x.why}</span></span>
                  <span aria-hidden className="text-primary">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggested.length > 0 && (
        <section aria-labelledby="feed-suggested">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="feed-suggested" className="text-lg font-bold">MSMEs to connect with</h2>
            <a href="https://pages.flameph.org/directory" className="text-sm font-semibold text-primary underline">See all</a>
          </div>
          <ul className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {suggested.map((b) => (
              <li key={b.id} className="w-40 shrink-0 snap-start">
                <a href={`/business/${b.slug}`} className="card flex h-full flex-col items-center gap-2 p-3 text-center">
                  <Avatar name={b.name} src={mediaUrl(b.logo_url)} size={48} />
                  <span className="line-clamp-2 text-sm font-semibold">{b.name}</span>
                  <span className="text-xs text-muted">{[b.sector, b.city].filter(Boolean).join(" · ")}</span>
                  <span className="mt-auto text-xs font-semibold text-primary">View and message</span>
                </a>
              </li>
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
