import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { FollowButton } from "@/components/shell/FollowButton";
import type { ActivityCard as Card } from "@/lib/feed-data";

/** Something that happened elsewhere on FLAME PH. The button opens the tab that owns it; finishing there brings the member back here. */
export function ActivityCard({ card, back }: { card: Card; back: string }) {
  return (
    <article id={card.id} aria-labelledby={`${card.id}-t`} className="card scroll-mt-24 p-4" data-activity={card.kind}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-bg-soft px-2.5 py-0.5 text-muted">{card.kind}</span>
        {card.badge && <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-ok">{card.badge}</span>}
      </div>
      <h3 id={`${card.id}-t`} className="mt-2 font-bold"><Link href={card.href} className="hover:underline">{card.title}</Link></h3>
      {card.sub && <p className="text-sm text-muted">{card.sub}</p>}
      {card.text && <p className="mt-1 line-clamp-3 text-[15px]">{card.text}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={card.href} className={buttonClass({ variant: card.follow ? "outline" : "primary", size: "sm", className: "min-h-11" })}>{card.cta}</Link>
        {card.follow && <div className="w-32"><FollowButton memberId={card.follow.memberId} following={card.follow.following} back={back} name={card.follow.name} /></div>}
      </div>
    </article>
  );
}
