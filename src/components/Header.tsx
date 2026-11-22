import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "./Logo";
import { DesktopNav } from "./DesktopNav";
import { SiteSearch } from "./SiteSearch";
import { AccountMenu } from "./AccountMenu";
import { CountBadge } from "./ui";
import { HomeButton } from "./shell/HomeButton";
import { NAV } from "@/lib/nav";
import { getDict, getLang } from "@/lib/i18n";

export type HeaderMember = { unread: number; inbox: number; latest: string | null };

/**
 * One header for every page, for visitors and signed-in members alike (owner, 22 Nov 2026).
 * Tablets, laptops and desktops (768px and wider): the FLAME PH logo and the Explore, Benefits, Opportunities, Get Involved,
 * Partner With Us and About menus (in one row from 1280px; on tablets and small laptops the menus sit in a second row). Members also get Messages and Inbox with their counts, and the Account menu.
 * Phones and folding phones: members keep the Home button (FLAME PH mark + "Home"), search, Messages and Inbox; visitors get
 * the logo, search and Join. The five-tab bottom bar does the rest on phones.
 */
export async function Header({ member }: { member?: HeaderMember }) {
  const [t, lang] = await Promise.all([getDict(), getLang()]);
  return (
    <header data-shell={member ? "top-bar" : "site-header"} className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">Skip to content</a>
      <div className="container-x flex min-h-14 flex-wrap items-center gap-x-2 md:min-h-16 xl:h-[72px] xl:flex-nowrap xl:gap-3">
        {member ? (
          <>
            <div className="md:hidden">
              <Suspense fallback={<Link href="/home" className="inline-flex min-h-11 items-center px-2 font-display text-lg font-extrabold">Home</Link>}>
                <HomeButton latest={member.latest} />
              </Suspense>
            </div>
            {/* For members the logo opens the Home feed (the home page sends members there). */}
            <span className="hidden md:inline-flex"><Logo priority height={40} className="h-10 w-auto xl:h-11" /></span>
          </>
        ) : (
          <Logo priority height={40} className="h-9 w-auto md:h-10 xl:h-11" />
        )}
        <DesktopNav groups={NAV} lang={lang} />
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-2">
          <SiteSearch />
          {member ? (
            <>
              <Link href="/messages" data-shell="messages" aria-label={member.unread ? `Messages, ${member.unread} unread` : "Messages"}
                className="btn btn-ghost relative h-11 w-11 p-0">
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H8l-4 4z" /></svg>
                {member.unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5"><CountBadge count={member.unread} label="unread messages" /></span>}
              </Link>
              <Link href="/workspace/inbox" data-shell="inbox" aria-label={member.inbox ? `Business inbox, ${member.inbox} new` : "Business inbox"}
                className="btn btn-ghost relative h-11 w-11 p-0">
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l2.5-8h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>
                {member.inbox > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5"><CountBadge count={member.inbox} label="new in your inbox" /></span>}
              </Link>
              <AccountMenu label={t.account} />
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost hidden px-2 text-sm md:inline-flex lg:px-4">{t.login}</Link>
              <Link href="/join" className="btn btn-flame px-3 text-sm lg:px-4">{t.joinFree}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
