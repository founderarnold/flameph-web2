import { FollowButton } from "@/components/shell/FollowButton";
import { acceptFriend, removeFriend, sendFriendRequest, setBlock, setMute } from "@/app/account/people-actions";
import { startConversation } from "@/app/account/message-actions";
import Link from "next/link";
import type { Relationship } from "@/lib/people";
import { reportHref } from "@/components/feed/PostCard";

const btn = "btn min-h-11 w-full px-3 text-sm";

function Hidden({ memberId, back, extra }: { memberId: string; back: string; extra?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="back" value={back} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

/** Follow, Friend, mute and block for one member. Plain forms, so they work before the page's JavaScript loads. */
export function RelationshipActions({ memberId, name, rel, back }: { memberId: string; name: string; rel: Relationship; back: string }) {
  // Before the 0018 database update only Follow exists.
  if (!rel.available) return <FollowButton memberId={memberId} following={rel.following} back={back} name={name} />;
  if (rel.blocked) {
    return (
      <form action={setBlock} className="grid gap-2">
        <Hidden memberId={memberId} back={back} extra={{ on: "0" }} />
        <p className="text-sm text-muted">You blocked {name}. You don&apos;t see each other&apos;s posts.</p>
        <button className={`${btn} btn-outline`} aria-label={`Unblock ${name}`}>Unblock</button>
      </form>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <FollowButton memberId={memberId} following={rel.following} back={back} name={name} />
        {rel.friend === "none" && (
          <form action={sendFriendRequest}>
            <Hidden memberId={memberId} back={back} />
            <button className={`${btn} btn-primary`} aria-label={`Add ${name} as a Friend`}>Add Friend</button>
          </form>
        )}
        {rel.friend === "sent" && (
          <form action={removeFriend}>
            <Hidden memberId={memberId} back={back} extra={{ what: "cancelled" }} />
            <button className={`${btn} btn-outline`} aria-label={`Cancel your Friend request to ${name}`}>Requested · Cancel</button>
          </form>
        )}
        {rel.friend === "received" && (
          <form action={acceptFriend}>
            <Hidden memberId={memberId} back={back} />
            <button className={`${btn} btn-primary`} aria-label={`Accept Friend request from ${name}`}>Accept Friend</button>
          </form>
        )}
        {rel.friend === "friends" && (
          <details className="relative">
            <summary className={`${btn} btn-outline list-none cursor-pointer`} aria-label={`You and ${name} are Friends. Options`}>✓ Friends</summary>
            <form action={removeFriend} className="mt-2">
              <Hidden memberId={memberId} back={back} extra={{ what: "unfriended" }} />
              <button className={`${btn} btn-outline`} aria-label={`Unfriend ${name}`}>Unfriend</button>
            </form>
          </details>
        )}
      </div>
      <form action={startConversation}>
        <Hidden memberId={memberId} back={back} />
        <button className={`${btn} btn-outline`} aria-label={`Send ${name} a message`}>Message</button>
      </form>
      {rel.friend === "received" && (
        <form action={removeFriend}>
          <Hidden memberId={memberId} back={back} extra={{ what: "declined" }} />
          <button className={`${btn} btn-outline`} aria-label={`Decline Friend request from ${name}`}>Decline request</button>
        </form>
      )}
      <details>
        <summary className="min-h-11 flex items-center cursor-pointer text-sm text-muted">More: mute, block or report</summary>
        <div className="mt-2 grid gap-2">
          <form action={setMute}>
            <Hidden memberId={memberId} back={back} extra={{ on: rel.muted ? "0" : "1" }} />
            <button className={`${btn} btn-outline`} aria-pressed={rel.muted} aria-label={`${rel.muted ? "Unmute" : "Mute"} ${name}`}>
              {rel.muted ? "Unmute" : "Mute (hide their posts from my feed)"}
            </button>
          </form>
          <Link href={reportHref("member", memberId, back)} className={`${btn} btn-outline`}>Report {name}</Link>
          <details>
            <summary className={`${btn} btn-outline list-none cursor-pointer`}>Block {name}</summary>
            <form action={setBlock} className="mt-2 grid gap-2">
              <Hidden memberId={memberId} back={back} extra={{ on: "1" }} />
              <p className="text-sm text-muted">Blocking ends any friendship and follow between you, stops messages both ways, and hides your posts and comments from each other. They aren&apos;t told.</p>
              <button className={`${btn} btn-primary`} aria-label={`Yes, block ${name}`}>Yes, block</button>
            </form>
          </details>
        </div>
      </details>
    </div>
  );
}
