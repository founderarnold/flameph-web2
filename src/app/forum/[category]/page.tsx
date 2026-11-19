import Link from "next/link";
import { InvestorWarning } from "@/components/feed/InvestorWarning";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { decodeCursor, industryFromSlug } from "@/lib/feed-rules";
import { feedPosts, postExtras, statsOf } from "@/lib/feed-data";
import { POST_KINDS, timeAgo } from "@/lib/feed-rules";
import { buttonClass } from "@/components/ui";

export const metadata = { robots: { index: false } };
const PAGE = 20;

/** Forum topics in one industry: member posts, newest first, 20 at a time, each opening its full thread. */
export default async function ForumCategory({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ before?: string }> }) {
  const { category } = await params;
  const industry = industryFromSlug(category);
  if (!industry) notFound();
  const { supabase } = await requireUser(`/forum/${category}`);
  const sp = await searchParams;
  const page = await feedPosts(supabase, { cursor: decodeCursor(sp.before), industry, chapter: null, following: false, followIds: new Set() }, PAGE);
  const { stats } = await postExtras(supabase, page.posts.map((p) => p.id), 0);
  return (
    <div className="container-x py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/forum" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> All topics</Link>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{industry}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/new-post?kind=question&industry=${encodeURIComponent(industry)}`} className={buttonClass({ variant: "primary" })}>Start a discussion</Link>
          <Link href={`/home?industry=${encodeURIComponent(industry)}`} className={buttonClass({ variant: "outline" })}>See in the feed</Link>
        </div>
        {page.posts.length === 0 ? <p className="card p-5 text-muted">No posts in {industry} yet. Start the first discussion.</p> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {page.posts.map((p) => {
              const s = statsOf(stats, p.id);
              return (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}`} className="block min-h-14 px-4 py-3 hover:bg-bg-soft">
                    <span className="line-clamp-2 font-semibold">{p.body}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {POST_KINDS[p.kind]?.label} · {p.author_name ?? "FLAME PH member"} · {timeAgo(p.created_at)} · {s.comments} repl{s.comments === 1 ? "y" : "ies"}
                      {p.status === "held" ? " · waiting for a check" : ""}
                    </span>
                  </Link>
                  {(p.kind === "investor" || p.author_investor) && <div className="px-4 pb-3"><InvestorWarning compact /></div>}
                </li>
              );
            })}
          </ul>
        )}
        {page.next && <Link href={`/forum/${category}?before=${encodeURIComponent(page.next)}`} className={buttonClass({ variant: "outline", block: true })}>Older posts</Link>}
      </div>
    </div>
  );
}
