import Link from "next/link";
import { mediaUrl } from "@/lib/content";
import { Avatar } from "@/components/ui";
import type { Suggestion } from "@/lib/suggestions";
import { FollowButton } from "./FollowButton";

/** A suggested member: logo or initials, name, industry and city, why they are suggested, a link to their business page (when published), and Follow. */
export function SuggestedMemberCard({ b, following, back, minisite }: { b: Suggestion; following: boolean; back: string; minisite?: boolean }) {
  const inner = (
    <>
      <Avatar name={b.name} src={mediaUrl(b.logo_url)} size={48} />
      <span className="line-clamp-2 text-sm font-semibold">{b.name}</span>
      <span className="text-xs text-muted">{[b.sector, b.city].filter(Boolean).join(" · ")}</span>
      {minisite && <span className="rounded-full bg-flame-soft px-2 py-0.5 text-xs font-semibold text-flame-strong">Has a mini-website</span>}
      {b.reason ? <span className="text-xs font-semibold text-primary">{b.reason}</span>
        : Boolean(b.mutual) && <span className="text-xs font-semibold text-primary">{b.mutual} mutual connection{b.mutual === 1 ? "" : "s"}</span>}
    </>
  );
  return (
    <div className="card flex h-full flex-col items-center gap-2 p-3 text-center">
      {b.slug ? <Link href={`/members/${b.slug}`} className="flex flex-col items-center gap-2">{inner}</Link> : <div className="flex flex-col items-center gap-2">{inner}</div>}
      <div className="mt-auto w-full"><FollowButton memberId={b.owner_id} following={following} back={back} name={b.name} /></div>
    </div>
  );
}
