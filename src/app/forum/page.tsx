import Link from "next/link";
import { getSession } from "@/lib/auth";
import { INDUSTRY_NAMES } from "@/lib/industries";
import { industrySlug, timeAgo } from "@/lib/feed-rules";
import { PageHero, buttonClass } from "@/components/ui";

export const metadata = { title: "Community Forum", description: "Discussions between FLAME PH members, by industry." };

/**
 * The FLAME PH community forum: member posts grouped by industry, with their replies. It is a view over the same posts
 * as the Home feed (one place to post, two ways to browse). Visitors see what it is and how to join; the posts are members-only.
 */
export default async function Forum() {
  const { supabase, user } = await getSession();
  const { data, error } = user && supabase ? await supabase.rpc("forum_categories") : { data: null, error: null };
  const stats = new Map(((data ?? []) as { category: string; posts: number; latest_at: string }[]).map((r) => [r.category, r]));
  return (
    <>
      <PageHero title="Community Forum" fil="Usapang negosyo" path="/forum"
        intro="Ask questions, share what works and find partners, grouped by industry. Only signed-in FLAME PH members can read and post." />
      <div className="container-x pb-12">
        <div className="mx-auto max-w-3xl space-y-5">
          {!user ? (
            <div className="card p-5">
              <p className="font-semibold">Join FLAME PH to read and post in the forum.</p>
              <p className="mt-1 text-muted">Membership is free. Your posts also appear in your Home feed.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/join?next=/forum" className={buttonClass({ variant: "primary" })}>Join free</Link>
                <Link href="/login?next=/forum" className={buttonClass({ variant: "outline" })}>Sign in</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Link href="/new-post?kind=question" className={buttonClass({ variant: "primary" })}>Ask a question</Link>
                <Link href="/home" className={buttonClass({ variant: "outline" })}>Back to feed</Link>
              </div>
              {error && <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">The forum opens after FLAME PH finishes a database update.</p>}
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card" aria-label="Forum topics by industry">
                {INDUSTRY_NAMES.map((name) => {
                  const s = stats.get(name);
                  return (
                    <li key={name}>
                      <Link href={`/forum/${industrySlug(name)}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-bg-soft">
                        <span><span className="block font-semibold">{name}</span>
                          <span className="block text-sm text-muted">{s ? `${s.posts} post${s.posts === 1 ? "" : "s"} · latest ${timeAgo(s.latest_at)}` : "No posts yet"}</span></span>
                        <span aria-hidden className="text-primary">→</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="card p-4">
            <p className="font-semibold">Also in Community</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li><Link href="/news" className="text-primary underline">Negosyo News</Link>, the FLAME PH blog</li>
              <li><Link href="/negosyo-talks" className="text-primary underline">FLAME Talks with MSMEs</Link></li>
              <li><Link href="/membership/terms" className="text-primary underline">Community Guidelines</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
