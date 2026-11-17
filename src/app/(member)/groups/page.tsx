import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { JoinLeave } from "@/components/people/JoinLeave";
import { groupDirectory } from "@/lib/groups-data";
import { chapterGroupSlug, type Group } from "@/lib/groups";
import { noteText } from "@/lib/people-rules";

export const metadata = { title: "Groups" };

const BACK = "/groups";

function Row({ g, count, member }: { g: Group; count: number; member: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 py-3">
      <Link href={`/groups/${g.slug}`} className="min-w-0 flex-1">
        <span className="block truncate font-semibold hover:underline">{g.name}</span>
        <span className="block text-xs text-muted">{count} member{count === 1 ? "" : "s"}{member ? " · You're in this group" : ""}</span>
      </Link>
      <JoinLeave slug={g.slug} groupId={g.id} member={member} name={g.name} back={BACK} />
    </li>
  );
}

/** Industry groups and chapter groups. Priority industries are open from the start; the rest open when a member starts them. */
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { supabase, user } = await requireUser(BACK);
  const sp = await searchParams;
  const [dir, { data: profile }] = await Promise.all([
    groupDirectory(supabase, user.id),
    supabase.from("profiles").select("chapter_id").eq("id", user.id).single(),
  ]);
  const { data: chapter } = profile?.chapter_id
    ? await supabase.from("chapters").select("id, name, slug").eq("id", profile.chapter_id).eq("published", true).maybeSingle()
    : { data: null };
  const industry = dir.groups.filter((g) => g.kind === "industry");
  const priority = industry.filter((g) => g.priority);
  const opened = industry.filter((g) => !g.priority);
  const chapterSlug = chapter ? chapterGroupSlug(chapter) : null;
  const chapterGroup = chapterSlug ? dir.groups.find((g) => g.slug === chapterSlug) : undefined;
  const openSlugs = new Set(dir.groups.map((g) => g.slug));
  const toStart = dir.catalog.filter((c) => !openSlugs.has(c.slug));
  const note = noteText(sp.note);
  const count = (g: Group) => dir.counts.get(g.id) ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/more" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> More</Link>
      <h1 className="text-2xl font-bold">Groups</h1>
      <p className="text-sm text-muted">Join groups for your industry and your chapter. Group posts show in the group and in the feed.</p>
      {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}
      {!dir.available && <Notice tone="info">Groups open after FLAME PH finishes a database update. Please check back soon.</Notice>}

      {chapter && dir.available && (
        <section aria-labelledby="g-chapter" className="card p-4">
          <h2 id="g-chapter" className="text-lg font-bold">Your chapter</h2>
          <ul className="divide-y divide-line">
            {chapterGroup ? <Row g={chapterGroup} count={count(chapterGroup)} member={dir.mine.has(chapterGroup.id)} /> : (
              <li className="flex items-center justify-between gap-2 py-3">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{chapter.name}</span><span className="block text-xs text-muted">No group yet. Be the first to join.</span></span>
                <JoinLeave slug={chapterSlug!} member={false} name={chapter.name} back={BACK} />
              </li>
            )}
          </ul>
        </section>
      )}

      {dir.available && (
        <section aria-labelledby="g-industry" className="card p-4">
          <h2 id="g-industry" className="text-lg font-bold">Industry groups</h2>
          <ul className="divide-y divide-line">
            {[...priority, ...opened].map((g) => <Row key={g.id} g={g} count={count(g)} member={dir.mine.has(g.id)} />)}
          </ul>
        </section>
      )}

      {dir.available && dir.groups.some((g) => g.kind === "chapter" && g.id !== chapterGroup?.id) && (
        <section aria-labelledby="g-chapters" className="card p-4">
          <h2 id="g-chapters" className="text-lg font-bold">Other chapter groups</h2>
          <ul className="divide-y divide-line">
            {dir.groups.filter((g) => g.kind === "chapter" && g.id !== chapterGroup?.id).map((g) => <Row key={g.id} g={g} count={count(g)} member={dir.mine.has(g.id)} />)}
          </ul>
        </section>
      )}

      {toStart.length > 0 && (
        <section aria-labelledby="g-more" className="card p-4">
          <h2 id="g-more" className="text-lg font-bold">More industries</h2>
          <p className="mt-1 text-sm text-muted">These groups aren&apos;t open yet. Starting one makes you its first member.</p>
          <ul className="divide-y divide-line">
            {toStart.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-2 py-3">
                <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                <JoinLeave slug={c.slug} member={false} name={c.name} back={`/groups/${c.slug}`} label="Start this group" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
