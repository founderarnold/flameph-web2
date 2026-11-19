import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Notice, buttonClass } from "@/components/ui";
import { JoinLeave } from "@/components/people/JoinLeave";
import { PostCard } from "@/components/feed/PostCard";
import { InvestorWarning } from "@/components/feed/InvestorWarning";
import { FeedFocus } from "@/components/shell/FeedFocus";
import { decodeCursor } from "@/lib/feed-rules";
import { feedPosts, investorLabels, postExtras, statsOf } from "@/lib/feed-data";
import { getGroup } from "@/lib/groups-data";
import { INVESTOR_GROUP, isGroupSlug } from "@/lib/groups";
import { mutedIds } from "@/lib/people";
import { noteText } from "@/lib/people-rules";

export const metadata = { title: "Group" };

/** One industry or chapter group: join or leave, and its posts, newest first, a page at a time. */
export default async function GroupPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ before?: string; note?: string; focus?: string }> }) {
  const { slug } = await params;
  if (!isGroupSlug(slug)) notFound();
  const here = `/groups/${slug}`;
  const { supabase, user } = await requireUser(here);
  const sp = await searchParams;
  const found = await getGroup(supabase, slug, user.id);
  const note = noteText(sp.note);

  if (!found.group) {
    // Not open yet: an industry from the catalogue, or the member's chapter, can be started here.
    const { data: cat } = found.available ? await supabase.from("group_catalog").select("name").eq("slug", slug).maybeSingle() : { data: null };
    if (!cat && !slug.startsWith("chapter-")) notFound();
    const name = cat?.name ?? "Chapter group";
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link href="/groups" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> All groups</Link>
        <h1 className="text-2xl font-bold">{name}</h1>
        {note && <div role="status"><Notice tone="warn">{note}</Notice></div>}
        {!found.available ? <Notice tone="info">Groups open after FLAME PH finishes a database update.</Notice> : (
          <div className="card space-y-3 p-4">
            <p>This group isn&apos;t open yet. Start it and you&apos;ll be its first member.</p>
            <JoinLeave slug={slug} member={false} name={name} back={here} label="Start this group" />
          </div>
        )}
      </div>
    );
  }

  const g = found.group;
  const investor = g.slug === INVESTOR_GROUP;
  const cursor = decodeCursor(sp.before);
  const muted = await mutedIds(supabase, user.id);
  const page = await feedPosts(supabase, { cursor, industry: null, chapter: null, following: false, followIds: new Set(), group: g.id, muted });
  const extras = await postExtras(supabase, page.posts.map((p) => p.id));
  const labels = await investorLabels(supabase, [...page.posts, ...[...extras.comments.values()].flat()]);
  const back = sp.before ? `${here}?before=${encodeURIComponent(sp.before)}` : here;
  const tag = { slug: g.slug, name: g.name };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <FeedFocus focus={sp.focus} latest={null} />
      <Link href="/groups" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> All groups</Link>
      <div className="card space-y-3 p-4">
        <h1 className="text-2xl font-bold">{g.name}</h1>
        <p className="text-sm text-muted">{g.kind === "chapter" ? "Chapter group" : "Industry group"} · {found.members ?? 0} member{found.members === 1 ? "" : "s"}{found.member ? " · You're in this group" : ""}</p>
        {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}
        <div className="grid grid-cols-2 gap-2">
          {found.member
            ? <Link href={`/new-post?group=${g.slug}`} className={buttonClass({ variant: "primary" })}>Post in this group</Link>
            : <JoinLeave slug={g.slug} member={false} name={g.name} back={here} />}
          {found.member && <JoinLeave slug={g.slug} groupId={g.id} member name={g.name} back={here} />}
        </div>
        {investor && <InvestorWarning />}
      </div>

      <section aria-labelledby="group-posts-h">
        <h2 id="group-posts-h" className="text-lg font-bold">{cursor ? "Older posts" : "Posts in this group"}</h2>
        {page.posts.length === 0 ? (
          <p className="card mt-3 p-5 text-muted">No posts yet.{found.member ? " Be the first to post." : " Join to post here."}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {page.posts.map((p) => (
              <li key={p.id}><PostCard post={p} stats={statsOf(extras.stats, p.id)} comments={extras.comments.get(p.id) ?? []} viewerId={user.id} back={back} group={tag} labels={labels} /></li>
            ))}
          </ul>
        )}
        {page.next && <Link href={`${here}?before=${encodeURIComponent(page.next)}`} className={`${buttonClass({ variant: "outline", block: true })} mt-4`} rel="next">Show older posts</Link>}
      </section>
    </div>
  );
}
