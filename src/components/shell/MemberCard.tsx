import Link from "next/link";
import { mediaUrl } from "@/lib/content";
import { Avatar } from "@/components/ui";
import type { SuggestedBiz } from "@/lib/suggestions";
import { FollowButton } from "./FollowButton";

/** A suggested MSME: logo or initials, name, industry and city, a link to their profile, and Follow. */
export function SuggestedMemberCard({ b, following, back }: { b: SuggestedBiz; following: boolean; back: string }) {
  return (
    <div className="card flex h-full flex-col items-center gap-2 p-3 text-center">
      <Link href={`/members/${b.slug}`} className="flex flex-col items-center gap-2">
        <Avatar name={b.name} src={mediaUrl(b.logo_url)} size={48} />
        <span className="line-clamp-2 text-sm font-semibold">{b.name}</span>
        <span className="text-xs text-muted">{[b.sector, b.city].filter(Boolean).join(" · ")}</span>
      </Link>
      <div className="mt-auto w-full"><FollowButton memberId={b.owner_id} following={following} back={back} name={b.name} /></div>
    </div>
  );
}
