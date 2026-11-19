import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { decodeCursor, encodeCursor } from "@/lib/feed-rules";
import { COMMENT_COLUMNS, getPost, groupTags, investorLabels, missing0026, postExtras, statsOf, type FeedComment } from "@/lib/feed-data";
import { relationship } from "@/lib/people";
import { noteText } from "@/lib/people-rules";
import { RelationshipActions } from "@/components/people/RelationshipActions";
import { CommentItem, PostCard } from "@/components/feed/PostCard";
import { CommentForm } from "@/components/feed/CommentForm";
import { InvestorWarning } from "@/components/feed/InvestorWarning";
import { FeedFocus } from "@/components/shell/FeedFocus";
import { Notice } from "@/components/ui";
import { DONE_TEXT, type FeedDone } from "@/lib/member-shell";

export const metadata = { title: "Post", robots: { index: false } };
const COMMENTS_PAGE = 30;

/** One member post with all its comments (members only). Shared links open here. */
export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string; delete?: string; focus?: string; done?: string; note?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser(`/posts/${id}`);
  const post = await getPost(supabase, id);
  if (!post) notFound();

  // Comments, newest first, COMMENTS_PAGE at a time.
  const cursor = decodeCursor(sp.before);
  const build = (cols: string) => {
    let req = supabase.from("feed_comments").select(cols).eq("post_id", id).eq("status", "published")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(COMMENTS_PAGE + 1);
    if (cursor) req = req.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
    return req;
  };
  const loadComments = async () => {
    const first = await build(`${COMMENT_COLUMNS}, author_investor`);
    return missing0026(first.error) ? build(COMMENT_COLUMNS) : first;
  };
  const mine = post.author_id === user.id;
  const [{ data: rows }, extras, groups, rel] = await Promise.all([loadComments(), postExtras(supabase, [id], 0), groupTags(supabase, [post]), mine ? null : relationship(supabase, user.id, post.author_id)]);
  const note = noteText(sp.note);
  const all = (rows ?? []) as unknown as FeedComment[];
  const comments = all.slice(0, COMMENTS_PAGE);
  const last = comments[comments.length - 1];
  const older = all.length > COMMENTS_PAGE && last ? `/posts/${id}?before=${encodeURIComponent(encodeCursor(last.created_at, last.id))}#comments` : null;
  const back = `/posts/${id}`;
  const done = sp.done && sp.done in DONE_TEXT ? (sp.done as FeedDone) : null;
  const investor = post.kind === "investor" || Boolean(post.author_investor);
  const labels = await investorLabels(supabase, [post, ...comments]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <FeedFocus focus={sp.focus} latest={null} />
      <h1 className="sr-only">Post by {post.author_name ?? "a FLAME PH member"}</h1>
      <Link href={`/home?focus=post-${id}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Back to feed</Link>
      {done && <div role="status"><Notice tone="ok">{DONE_TEXT[done]}</Notice></div>}
      {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}
      <PostCard post={post} stats={statsOf(extras.stats, id)} comments={[]} viewerId={user.id} back={back} detail confirmDelete={sp.delete === "1"} group={post.group_id ? groups.get(post.group_id) : null} labels={labels} />
      {rel && (
        <section aria-labelledby="author-h" className="card p-4">
          <h2 id="author-h" className="mb-2 text-sm font-bold">Connect with {post.author_name ?? "this member"}</h2>
          <RelationshipActions memberId={post.author_id} name={post.author_name ?? "this member"} rel={rel} back={back} />
        </section>
      )}
      {post.status === "published" && (
        <section id="comments" aria-labelledby="comments-h" className="card scroll-mt-24 p-4">
          <h2 id="comments-h" className="font-bold">Comments ({statsOf(extras.stats, id).comments})</h2>
          {investor && <div className="mt-2"><InvestorWarning compact /></div>}
          <CommentForm postId={id} back={back} />
          {comments.length === 0 ? <p className="mt-3 text-sm text-muted">No comments yet. Be the first.</p> : (
            <ul className="mt-3 space-y-2">
              {comments.map((c) => <CommentItem key={c.id} c={c} viewerId={user.id} postAuthorId={post.author_id} back={back} investor={investor} labels={labels} />)}
            </ul>
          )}
          {older && <Link href={older} className="btn btn-outline mt-3 min-h-11 w-full">Older comments</Link>}
          {investor && comments.length > 2 && <div className="mt-3"><InvestorWarning compact /></div>}
        </section>
      )}
    </div>
  );
}
