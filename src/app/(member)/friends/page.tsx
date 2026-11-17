import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Avatar, Notice } from "@/components/ui";
import { FollowButton } from "@/components/shell/FollowButton";
import { acceptFriend, removeFriend, setBlock, setMute } from "@/app/account/people-actions";
import { blockedIds, friendLists, memberCards, mutedIds, type MemberCard } from "@/lib/people";
import { followingIds } from "@/lib/suggestions";
import { noteText } from "@/lib/people-rules";

export const metadata = { title: "Friends and requests" };

const BACK = "/friends";
const btn = "btn min-h-11 px-3 text-sm";

function Person({ c, children }: { c: MemberCard | undefined; children: React.ReactNode }) {
  const name = c?.name ?? "FLAME PH member";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} size={36} />
        <div className="min-w-0">
          {c?.slug ? <Link href={`/members/${c.slug}`} className="block truncate font-semibold hover:underline">{name}</Link> : <span className="block truncate font-semibold">{name}</span>}
          <span className="block truncate text-xs text-muted">{[c?.sector, c?.city].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

function One({ action, id, name, label, aria, extra, primary }: { action: (fd: FormData) => Promise<void>; id: string; name: string; label: string; aria: string; extra?: Record<string, string>; primary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="member_id" value={id} />
      <input type="hidden" name="back" value={BACK} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button className={`${btn} ${primary ? "btn-primary" : "btn-outline"}`} aria-label={`${aria} ${name}`}>{label}</button>
    </form>
  );
}

function Block({ id, title, count, children, empty }: { id: string; title: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-24 p-4">
      <h2 id={`${id}-h`} className="text-lg font-bold">{title} <span className="text-muted">({count})</span></h2>
      {count === 0 ? <p className="mt-2 text-sm text-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

/** Friend requests (accept or decline), Friends, people you follow, and who you muted or blocked. */
export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ note?: string }> }) {
  const { supabase, user } = await requireUser(BACK);
  const sp = await searchParams;
  const [lists, following, muted, blocked] = await Promise.all([
    friendLists(supabase, user.id), followingIds(supabase, user.id), mutedIds(supabase, user.id), blockedIds(supabase, user.id),
  ]);
  const followList = [...following].slice(0, 100);
  const cards = await memberCards(supabase, [...lists.received, ...lists.sent, ...lists.friends, ...followList, ...muted].slice(0, 100));
  // Blocked members aren't returned by member_cards (by design), so their names come from their published business.
  const blockedList = [...blocked].slice(0, 50);
  const { data: blockedBiz } = blockedList.length
    ? await supabase.from("businesses").select("owner_id, name, slug, sector, city").in("owner_id", blockedList).limit(50)
    : { data: [] };
  const blockedCards = new Map((blockedBiz ?? []).map((b) => [b.owner_id as string, { id: b.owner_id, name: b.name, slug: null, sector: b.sector, city: b.city, province: null, chapter_id: null } as MemberCard]));
  const note = noteText(sp.note);
  const name = (id: string) => cards.get(id)?.name ?? "this member";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/more" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> More</Link>
      <h1 className="text-2xl font-bold">Friends and requests</h1>
      <p className="text-sm text-muted"><strong>Follow</strong> is one-way: you see a member&apos;s posts, no approval needed. <strong>Friends</strong> is two-way: both of you accept, and you can see each other&apos;s Friend-only posts.</p>
      {note && <div role="status"><Notice tone="ok">{note}</Notice></div>}
      {!lists.available && <Notice tone="info">Friends open after FLAME PH finishes a database update. Follow works today.</Notice>}

      <Block id="requests" title="Friend requests" count={lists.received.length} empty="No new requests.">
        {lists.received.map((id) => (
          <Person key={id} c={cards.get(id)}>
            <One action={acceptFriend} id={id} name={name(id)} label="Accept" aria="Accept Friend request from" primary />
            <One action={removeFriend} id={id} name={name(id)} label="Decline" aria="Decline Friend request from" extra={{ what: "declined" }} />
          </Person>
        ))}
      </Block>

      <Block id="friends" title="Friends" count={lists.friends.length} empty="No Friends yet. Open a member's profile and press Add Friend.">
        {lists.friends.map((id) => (
          <Person key={id} c={cards.get(id)}>
            <One action={removeFriend} id={id} name={name(id)} label="Unfriend" aria="Unfriend" extra={{ what: "unfriended" }} />
          </Person>
        ))}
      </Block>

      {lists.sent.length > 0 && (
        <Block id="sent" title="Requests you sent" count={lists.sent.length} empty="">
          {lists.sent.map((id) => (
            <Person key={id} c={cards.get(id)}>
              <One action={removeFriend} id={id} name={name(id)} label="Cancel" aria="Cancel your Friend request to" extra={{ what: "cancelled" }} />
            </Person>
          ))}
        </Block>
      )}

      <Block id="following" title="People you follow" count={following.size} empty="You don't follow anyone yet. Find members to follow in Find members.">
        {followList.map((id) => (
          <Person key={id} c={cards.get(id)}>
            <div className="w-32"><FollowButton memberId={id} following back={BACK} name={name(id)} /></div>
          </Person>
        ))}
      </Block>

      <Block id="muted" title="Muted" count={muted.size} empty="Nobody muted. Muting hides a member's posts from your feed without telling them.">
        {[...muted].slice(0, 100).map((id) => (
          <Person key={id} c={cards.get(id)}>
            <One action={setMute} id={id} name={name(id)} label="Unmute" aria="Unmute" extra={{ on: "0" }} />
          </Person>
        ))}
      </Block>

      <Block id="blocked" title="Blocked" count={blocked.size} empty="Nobody blocked.">
        {blockedList.map((id) => (
          <Person key={id} c={blockedCards.get(id)}>
            <One action={setBlock} id={id} name={blockedCards.get(id)?.name ?? "this member"} label="Unblock" aria="Unblock" extra={{ on: "0" }} />
          </Person>
        ))}
      </Block>
    </div>
  );
}
