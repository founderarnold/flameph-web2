import Link from "next/link";
import { Suspense } from "react";
import { SiteSearch } from "@/components/SiteSearch";
import { AccountMenu } from "@/components/AccountMenu";
import { CountBadge } from "@/components/ui";
import { HomeButton } from "./HomeButton";
import { MemberTopTabs } from "./MemberTabsNav";

/** Sticky top bar for signed-in members: Home (left), then search and Messages with the unread count (right). */
export function MemberTopBar({ unread, latest, accountLabel }: { unread: number; latest: string | null; accountLabel: string }) {
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
          <Link href="/account/inquiries" data-shell="messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
            className="btn btn-ghost relative h-11 w-11 p-0">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4z" /></svg>
            {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5"><CountBadge count={unread} label="unread messages" /></span>}
          </Link>
          <AccountMenu label={accountLabel} />
        </div>
      </div>
    </header>
  );
}
