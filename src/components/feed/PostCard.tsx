import Link from "next/link";
import { Avatar } from "@/components/ui";
import { POST_KINDS, REACTIONS, splitLinks, timeAgo, type ReactionKind } from "@/lib/feed-rules";
import type { FeedComment, FeedPost, GroupTag, PostStats } from "@/lib/feed-data";
import { deleteComment, deletePost, reactToPost } from "@/app/account/feed-actions";
import { CommentForm } from "./CommentForm";
import { InvestorWarning } from "./InvestorWarning";
import { ShareButton } from "./ShareButton";
import { PostMedia } from "./PostMedia";
import { INVESTOR_PROFILE_LABEL, REGISTRATION_LABEL_MEANING, registrationLabel, shareText, type InvestorLabel } from "@/lib/investor";

/** Link to the report form for one post, comment, member or listing. */
export const reportHref = (type: string, id: string, back: string) => `/report?${new URLSearchParams({ type, id, back })}`;

export function PostText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {splitLinks(text).map((p, i) => p.href
        ? <a key={i} href={p.href} rel="nofollow ugc noopener noreferrer" target="_blank" className="text-primary underline">{p.text}</a>
        : <span key={i}>{p.text}</span>)}
    </p>
  );
}

/** "Investor or funder" next to the name, and the registration label (a label only, never an endorsement). */
export function InvestorBadge({ label }: { label?: InvestorLabel | null }) {
  const reg = registrationLabel(label);
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
      <span className="rounded-full bg-warn-soft px-2 py-0.5 font-bold text-warn">{INVESTOR_PROFILE_LABEL}</span>
      {reg && <span className="rounded-full bg-bg-soft px-2 py-0.5 text-muted" title={REGISTRATION_LABEL_MEANING}>{reg}</span>}
    </span>
  );
}

function Author({ name, slug, at, extra, investor = false, label }: { name: string; slug: string | null; at: string; extra?: React.ReactNode; investor?: boolean; label?: InvestorLabel | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} size={36} />
      <div className="min-w-0">
        {slug ? <Link href={`/members/${slug}`} className="block truncate font-semibold hover:underline">{name}</Link> : <span className="block truncate font-semibold">{name}</span>}
        <span className="block text-xs text-muted"><time dateTime={at}>{timeAgo(at)}</time>{extra}</span>
        {investor && <InvestorBadge label={label} />}
      </div>
    </div>
  );
}

export function CommentItem({ c, viewerId, postAuthorId, back, investor, labels }: { c: FeedComment; viewerId: string; postAuthorId: string; back: string; investor: boolean; labels?: Map<string, InvestorLabel> }) {
  const name = c.author_name ?? "FLAME PH member";
  const canDelete = c.author_id === viewerId || postAuthorId === viewerId;
  return (
    <li id={`comment-${c.id}`} className="rounded-xl bg-bg-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <Author name={name} slug={c.author_slug} at={c.created_at} investor={Boolean(c.author_investor)} label={labels?.get(c.author_id)} />
        {c.author_id !== viewerId && <Link href={reportHref("comment", c.id, back)} className="btn btn-ghost min-h-11 px-2 text-xs" aria-label={`Report comment by ${name}`}>Report</Link>}
        {canDelete && (
          <form action={deleteComment}>
            <input type="hidden" name="comment_id" value={c.id} /><input type="hidden" name="post_id" value={c.post_id} /><input type="hidden" name="back" value={back} />
            <button className="btn btn-ghost min-h-11 px-2 text-xs" aria-label={`Delete comment by ${name}`}>Delete</button>
          </form>
        )}
      </div>
      <div className="mt-1.5"><PostText text={c.body} /></div>
      {investor && <p className="mt-1 text-xs text-muted">Reply to an investor or funder post. The warning above applies.</p>}
      {!investor && c.author_investor && <div className="mt-2"><InvestorWarning compact /></div>}
    </li>
  );
}

/** One member post: who, what, the reactions, comments and sharing. Every button is a plain form, so it works before JavaScript loads. */
export function PostCard({ post, stats, comments, viewerId, back, detail = false, confirmDelete = false, group = null, labels }: {
  post: FeedPost; stats: PostStats; comments: FeedComment[]; viewerId: string; back: string; detail?: boolean; confirmDelete?: boolean; group?: GroupTag | null;
  /** Registration labels of investor/funder authors (investorLabels in feed-data). */
  labels?: Map<string, InvestorLabel>;
}) {
  const name = post.author_name ?? "FLAME PH member";
  // An investor/funder post: by kind (set by the database from the words, the group or the author's profile type).
  const investor = post.kind === "investor" || Boolean(post.author_investor);
  const mine = post.author_id === viewerId;
  const title = `${name}: ${post.body.slice(0, 60)}`;
  const total = stats.likes + stats.loves + stats.helpful;
  const count: Record<ReactionKind, number> = { like: stats.likes, love: stats.loves, helpful: stats.helpful };
  return (
    <article id={`post-${post.id}`} aria-labelledby={`post-${post.id}-by`} className="card scroll-mt-24 p-4">
      <div className="flex items-start justify-between gap-2">
        <div id={`post-${post.id}-by`} className="min-w-0"><Author name={name} slug={post.author_slug} at={post.created_at} investor={Boolean(post.author_investor)} label={labels?.get(post.author_id)} /></div>
        {mine && !detail && <Link href={`/posts/${post.id}?delete=1`} className="btn btn-ghost min-h-11 px-2 text-xs" aria-label="Delete your post">Delete</Link>}
        {!mine && <Link href={reportHref("post", post.id, back)} className="btn btn-ghost min-h-11 shrink-0 px-2 text-xs" aria-label={`Report post by ${name}`}>Report</Link>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span className={`rounded-full px-2.5 py-0.5 ${post.kind === "fulfillment" ? "bg-flame-soft text-fg" : investor ? "bg-warn-soft text-warn" : "bg-bg-soft text-muted"}`}>{POST_KINDS[post.kind]?.label ?? "Post"}</span>
        <Link href={`/home?industry=${encodeURIComponent(post.category)}`} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-primary hover:underline">{post.subcategory ?? post.category}</Link>
        {group && <Link href={`/groups/${group.slug}`} className="rounded-full bg-bg-soft px-2.5 py-0.5 text-fg hover:underline">Group: {group.name}</Link>}
        {post.audience === "friends" && <span className="rounded-full bg-bg-soft px-2.5 py-0.5 text-muted">👥 Friends only</span>}
        {post.status === "held" && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-warn">Waiting for a check · only you can see it</span>}
      </div>
      {investor && <div className="mt-3"><InvestorWarning compact={!detail} /></div>}
      <div className="mt-3">{detail ? <PostText text={post.body} /> : <div className="line-clamp-[12]"><PostText text={post.body} /></div>}</div>
      <PostMedia post={post} />
      {post.kind === "fulfillment" && (
        <p className="mt-2 text-sm"><Link href={`/fulfillment#offer-${post.id}`} className="font-semibold text-primary underline">See all fulfillment offers</Link></p>
      )}

      <p className="mt-3 text-xs text-muted">
        {total > 0 && <span>{(Object.keys(REACTIONS) as ReactionKind[]).filter((k) => count[k] > 0).map((k) => `${REACTIONS[k].emoji} ${count[k]}`).join("  ")}</span>}
        {total > 0 && stats.comments > 0 && " · "}
        {stats.comments > 0 && <Link href={`/posts/${post.id}`} className="underline">{stats.comments} comment{stats.comments === 1 ? "" : "s"}</Link>}
      </p>

      {post.status === "published" && (
        <div className="mt-2 grid grid-cols-5 gap-1 border-t border-line pt-2">
          {(Object.keys(REACTIONS) as ReactionKind[]).map((k) => (
            <form key={k} action={reactToPost}>
              <input type="hidden" name="post_id" value={post.id} /><input type="hidden" name="kind" value={k} />
              <input type="hidden" name="current" value={stats.mine ?? ""} /><input type="hidden" name="back" value={back} />
              <button aria-pressed={stats.mine === k} aria-label={`${REACTIONS[k].label}${count[k] ? `, ${count[k]}` : ""}`}
                className={`btn min-h-11 w-full flex-col gap-0 px-1 text-xs ${stats.mine === k ? "btn-outline border-primary text-primary" : "btn-ghost"}`}>
                <span aria-hidden className="text-base leading-none">{REACTIONS[k].emoji}</span><span aria-hidden>{REACTIONS[k].label}</span>
              </button>
            </form>
          ))}
          {detail ? <span /> : <Link href={`/posts/${post.id}#comments`} className="btn btn-ghost min-h-11 w-full flex-col gap-0 px-1 text-xs"><span aria-hidden className="text-base leading-none">💬</span>Comment</Link>}
          <ShareButton path={`/posts/${post.id}`} title={investor ? `Investor or funder post by ${name}` : title} text={shareText(investor)} />
        </div>
      )}

      {mine && detail && confirmDelete && (
        <form action={deletePost} className="mt-3 rounded-xl border border-danger/40 bg-danger-soft p-3">
          <input type="hidden" name="post_id" value={post.id} />
          <p className="font-semibold">Delete this post? Its comments and reactions go too. This can&apos;t be undone.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-danger min-h-11">Yes, delete</button>
            <Link href={`/posts/${post.id}`} className="btn btn-outline min-h-11">Keep it</Link>
          </div>
        </form>
      )}
      {mine && detail && !confirmDelete && <Link href={`/posts/${post.id}?delete=1`} className="mt-2 inline-block text-sm text-muted underline">Delete this post</Link>}

      {!detail && post.status === "published" && (
        <div className="mt-2">
          {comments.length > 0 && (
            <ul className="space-y-2" aria-label="Latest comments">
              {stats.comments > comments.length && <li><Link href={`/posts/${post.id}#comments`} className="text-sm font-semibold text-primary underline">See all {stats.comments} comments</Link></li>}
              {comments.map((c) => <CommentItem key={c.id} c={c} viewerId={viewerId} postAuthorId={post.author_id} back={back} investor={investor} labels={labels} />)}
            </ul>
          )}
          <CommentForm postId={post.id} back={back} />
        </div>
      )}
    </article>
  );
}
