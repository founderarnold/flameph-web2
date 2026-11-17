import Link from "next/link";
import { Suspense } from "react";
import { SiteSearch } from "@/components/SiteSearch";
import { AccountMenu } from "@/components/AccountMenu";
import { CountBadge } from "@/components/ui";
import { HomeButton } from "./HomeButton";
import { MemberTopTabs } from "./MemberTabsNav";

/**
 * Sticky top bar for signed-in members: Home (left), then search, Messages (unread member messages), Inbox (new leads,
 * quote requests and Friend requests) and the account menu (right). It is on every member screen.
 */
export function MemberTopBar({ unread, inbox, latest, accountLabel }: { unread: number; inbox: number; latest: string | null; accountLabel: string }) {
  return (
    <header data-shell="top-bar" className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">Skip to content</a>
      <div className="container-x flex h-14 items-center gap-2 lg:h-16">
        <Suspense fallback={<Link href="/home" className="inline-flex min-h-11 items-center px-2 font-display text-lg font-extrabold">Home</Link>}>
          <HomeButton latest={latest} />
        </Suspense>
        <div className="ml-4 hidden lg:block"><MemberTopTabs /></div>
        <div className="ml-auto flex items-center gap-1">
          <SiteSearch />
          <Link href="/messages" data-shell="messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
            className="btn btn-ghost relative h-11 w-11 p-0">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4z" /></svg>
            {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5"><CountBadge count={unread} label="unread messages" /></span>}
          </Link>
          <Link href="/workspace/inbox" data-shell="inbox" aria-label={inbox ? `Business inbox, ${inbox} new` : "Business inbox"}
            className="btn btn-ghost relative h-11 w-11 p-0">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l2.5-8h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>
            {inbox > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5"><CountBadge count={inbox} label="new in your inbox" /></span>}
          </Link>
          <AccountMenu label={accountLabel} />
        </div>
      </div>
    </header>
  );
}
