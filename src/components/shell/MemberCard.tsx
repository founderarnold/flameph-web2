import Link from "next/link";
import { mediaUrl } from "@/lib/content";
import { Avatar } from "@/components/ui";
import type { Suggestion } from "@/lib/suggestions";
import { FollowButton } from "./FollowButton";

/**
 * A suggested member: their photo (else their business logo, else initials), name, verified badge, business name,
 * city or municipality and province, followers, why they are suggested, a link to their page, and Follow.
 */
export function SuggestedMemberCard({ b, following, back, minisite }: { b: Suggestion; following: boolean; back: string; minisite?: boolean }) {
  const place = [b.city, b.province].filter(Boolean).join(", ");
  const followers = typeof b.followers === "number" ? b.followers : null;
  const inner = (
    <>
      <Avatar name={b.name} src={mediaUrl(b.avatar_url ?? null) ?? mediaUrl(b.logo_url)} size={56} />
      <span className="line-clamp-2 text-sm font-semibold">
        {b.name}
        {b.verified && <span className="ml-1 inline-flex align-middle text-primary" title="Verified by FLAME PH" aria-label="Verified by FLAME PH">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden><path fill="currentColor" d="M10 1.5l2.3 1.7 2.8-.3 1 2.7 2.4 1.5-.6 2.8.6 2.8-2.4 1.5-1 2.7-2.8-.3L10 18.5l-2.3-1.7-2.8.3-1-2.7-2.4-1.5.6-2.8-.6-2.8 2.4-1.5 1-2.7 2.8.3z"/><path fill="#fff" d="M8.6 13.2L5.8 10.4l1.1-1.1 1.7 1.7 4.5-4.5 1.1 1.1z"/></svg>
        </span>}
      </span>
      {b.business_name && b.business_name !== b.name && <span className="line-clamp-2 text-xs font-semibold text-fg">{b.business_name}</span>}
      {(b.sector || place) && <span className="text-xs text-muted">{[b.sector, place].filter(Boolean).join(" · ")}</span>}
      {followers !== null && <span className="text-xs text-muted">{followers} {followers === 1 ? "follower" : "followers"}</span>}
      {minisite && <span className="rounded-full bg-flame-soft px-2 py-0.5 text-xs font-semibold text-flame-strong">Has a mini-website</span>}
      {b.reason ? <span className="text-xs font-semibold text-primary">{b.reason}</span>
        : Boolean(b.mutual) && <span className="text-xs font-semibold text-primary">{b.mutual} mutual connection{b.mutual === 1 ? "" : "s"}</span>}
    </>
  );
  return (
    <div className="card flex h-full flex-col items-center gap-1.5 p-3 text-center">
      {b.slug ? <Link href={`/members/${b.slug}`} className="flex min-w-0 flex-col items-center gap-1.5">{inner}</Link> : <div className="flex min-w-0 flex-col items-center gap-1.5">{inner}</div>}
      <div className="mt-auto w-full pt-1"><FollowButton memberId={b.owner_id} following={following} back={back} name={b.name} /></div>
    </div>
  );
}
