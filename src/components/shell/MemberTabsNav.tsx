"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FEED, TABS, TOP_LEVEL, VISITOR_TABS, activeTab, activeVisitorTab, type Tab } from "@/lib/member-shell";
import { TabIcon } from "./TabIcon";
import { CreateSheet } from "./CreateSheet";
import { MobileMenu, type MenuLabels, type MenuMember } from "@/components/MobileMenu";
import { CountBadge } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

const GUARD = "flTabGuard";

/**
 * The phone's back button on a top-level member page returns to the feed, not out of the app.
 * On such a page, an extra history entry (marked GUARD) sits on top of the page's own entry. Pressing back lands on
 * the unmarked entry underneath, and we replace it with the feed.
 */
export function useBackToFeed() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // The address bar, not the route: /fulfillment and /pos are served by the member pages under /m/.
    const top = TOP_LEVEL.find((href) => href === window.location.pathname);
    if (!top) return;
    const state = window.history.state ?? {};
    if (!state[GUARD]) window.history.pushState({ ...state, [GUARD]: true }, "", window.location.href);
    const onPop = (e: PopStateEvent) => {
      // Let Next.js finish restoring the page first, then swap it for the feed.
      if (window.location.pathname === top && !(e.state && e.state[GUARD])) setTimeout(() => router.replace(FEED), 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pathname, router]);
}

/** Tapping the tab you are already on takes you to the feed (on the feed itself, back to the top). */
function useTabClick() {
  const pathname = usePathname();
  const router = useRouter();
  const current = activeTab(pathname);
  return (href: string) => (e: React.MouseEvent) => {
    if (current?.href !== href) return;
    e.preventDefault();
    if (href === FEED && pathname === FEED) window.scrollTo({ top: 0, behavior: "smooth" });
    else router.push(FEED);
  };
}

const tabClass = (active: boolean) =>
  `relative flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold leading-tight tracking-tight whitespace-nowrap min-[360px]:text-xs ${active ? "text-primary" : "text-muted"}`;

export type BarMenu = { lang: Lang; labels: MenuLabels };

/**
 * The five-tab bottom bar on phones and folding phones (below 768px). Hidden from 768px up, where the header menus take over.
 * Members: Home, Workspace, Create (+), Inbox, Menu. Visitors: Home, Explore, Join Free, Free Tools, Menu (owner, 28 Nov 2026).
 * Menu opens the phone menu for both. Labels never wrap or cut off; each tap target is at least 56px tall.
 */
export function MemberBottomBar({ menu, member }: { menu: BarMenu; member?: { inbox: number; menu: MenuMember } | null }) {
  return member ? <MemberBar menu={menu} member={member} /> : <VisitorBar menu={menu} />;
}

function MenuTab({ menu, member, t }: { menu: BarMenu; member: MenuMember | null; t: Tab }) {
  return (
    <MobileMenu lang={menu.lang} signedIn={!!member} member={member} labels={menu.labels}
      trigger={(open, isOpen) => (
        <button type="button" onClick={open} aria-expanded={isOpen} aria-controls="site-menu" aria-haspopup="dialog" data-tab={t.key} aria-label="Menu: all pages, tools and programs" className={tabClass(isOpen)}>
          <TabIcon k={t.key} />
          <span data-tab-label aria-hidden>{t.label}</span>
        </button>
      )} />
  );
}

function MemberBar({ menu, member }: { menu: BarMenu; member: { inbox: number; menu: MenuMember } }) {
  const pathname = usePathname();
  const onTab = useTabClick();
  useBackToFeed();
  const current = activeTab(pathname);
  return (
    <nav aria-label="Member tabs" data-shell="bottom-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = current?.key === t.key;
          if (t.key === "menu") return <li key={t.key} className="min-w-0"><MenuTab menu={menu} member={member.menu} t={t} /></li>;
          if (t.key === "create") {
            return (
              <li key={t.key} className="min-w-0">
                <CreateSheet trigger={(open, isOpen) => (
                  <button type="button" onClick={open} aria-expanded={isOpen} aria-controls="create-sheet" aria-haspopup="dialog" data-tab={t.key} className={tabClass(active || isOpen)}>
                    <span className="-my-[5px] flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white"><TabIcon k={t.key} /></span>
                    <span data-tab-label>{t.label}</span>
                  </button>
                )} />
              </li>
            );
          }
          const href = t.href!;
          const inbox = t.key === "inbox" ? member.inbox : 0;
          return (
            <li key={t.key} className="min-w-0">
              <Link href={href} onClick={onTab(href)} aria-current={active ? "page" : undefined} data-tab={t.key}
                aria-label={inbox ? `${t.label}, ${inbox} new` : undefined} className={tabClass(active)}>
                <TabIcon k={t.key} />
                {inbox > 0 && <span aria-hidden className="absolute left-1/2 top-1 ml-1.5"><CountBadge count={inbox} label="new in your inbox" /></span>}
                <span data-tab-label>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function VisitorBar({ menu }: { menu: BarMenu }) {
  const pathname = usePathname();
  const current = activeVisitorTab(pathname);
  return (
    <nav aria-label="Quick links" data-shell="bottom-bar" data-visitor className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {VISITOR_TABS.map((t) => {
          if (t.key === "menu") return <li key={t.key} className="min-w-0"><MenuTab menu={menu} member={null} t={t} /></li>;
          const active = current?.key === t.key;
          return (
            <li key={t.key} className="min-w-0">
              <Link href={t.href!} aria-current={active ? "page" : undefined} data-tab={t.key} className={tabClass(active)}>
                <TabIcon k={t.key} />
                <span data-tab-label>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
