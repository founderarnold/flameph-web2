import Link from "next/link";
import { mediaUrl } from "@/lib/content";
import { Avatar } from "@/components/ui";
import type { Suggestion } from "@/lib/suggestions";
import { FollowButton } from "./FollowButton";

const followersLabel = (n: number) => `${n.toLocaleString("en-PH")} follower${n === 1 ? "" : "s"}`;

/**
 * A member to follow: their photo (or business logo, or initials), name and Verified badge, business name,
 * city or municipality and province, follower count, why they are suggested, and Follow.
 */
export function SuggestedMemberCard({ b, following, back, minisite }: { b: Suggestion; following: boolean; back: string; minisite?: boolean }) {
  const name = b.person_name || b.name;
  const business = b.business_name && b.business_name !== name ? b.business_name : null;
  const place = [b.city, b.province].filter(Boolean).join(", ");
  const photo = mediaUrl(b.avatar_path) ?? mediaUrl(b.logo_url);
  const inner = (
    <>
      <Avatar name={name} src={photo} size={56} />
      <span className="flex max-w-full items-start justify-center gap-1">
        <span className="line-clamp-2 text-sm font-semibold">{name}</span>
        {b.verified && <span className="shrink-0 rounded-full bg-ok-soft px-1.5 text-xs font-bold text-ok" title="Verified business: FLAME PH checked their DTI, SEC or BMBE documents">✓<span className="sr-only"> Verified</span></span>}
      </span>
      {business && <span className="line-clamp-2 text-xs font-semibold">{business}</span>}
      {b.sector && <span className="line-clamp-1 text-xs text-muted">{b.sector}</span>}
      {place && <span className="line-clamp-2 text-xs text-muted"><span aria-hidden>📍 </span>{place}</span>}
      {typeof b.followers === "number" && <span className="text-xs text-muted">{followersLabel(b.followers)}</span>}
      {minisite && <span className="rounded-full bg-flame-soft px-2 py-0.5 text-xs font-semibold text-flame-strong">Has a mini-website</span>}
      {b.reason ? <span className="text-xs font-semibold text-primary">{b.reason}</span>
        : Boolean(b.mutual) && <span className="text-xs font-semibold text-primary">{b.mutual} mutual connection{b.mutual === 1 ? "" : "s"}</span>}
    </>
  );
  return (
    <div className="card flex h-full min-w-0 flex-col items-center gap-1.5 p-3 text-center">
      {b.slug ? <Link href={`/members/${b.slug}`} className="flex min-w-0 max-w-full flex-col items-center gap-1.5">{inner}</Link> : <div className="flex min-w-0 max-w-full flex-col items-center gap-1.5">{inner}</div>}
      <div className="mt-auto w-full pt-1"><FollowButton memberId={b.owner_id} following={following} back={back} name={name} /></div>
    </div>
  );
}
