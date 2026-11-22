"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FEED, TABS, activeTab } from "@/lib/member-shell";
import { TabIcon } from "./TabIcon";
import { MobileMenu, type MenuLabels } from "@/components/MobileMenu";
import type { NavGroup } from "@/lib/nav";
import type { Lang } from "@/lib/i18n";

const GUARD = "flTabGuard";

/**
 * The phone's back button on a top-level tab returns to the feed, not out of the app.
 * On a tab, an extra history entry (marked GUARD) sits on top of the tab's own entry. Pressing back lands on
 * the unmarked entry underneath, and we replace it with the feed.
 */
export function useBackToFeed() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    // The address bar, not the route: /fulfillment and /pos are served by the member pages under /m/.
    const tab = TABS.find((t) => t.href === window.location.pathname);
    if (!tab) return;
    const state = window.history.state ?? {};
    if (!state[GUARD]) window.history.pushState({ ...state, [GUARD]: true }, "", window.location.href);
    const onPop = (e: PopStateEvent) => {
      // Let Next.js finish restoring the page first, then swap it for the feed.
      if (window.location.pathname === tab.href && !(e.state && e.state[GUARD])) setTimeout(() => router.replace(FEED), 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [pathname, router]);
}

/** Tapping the tab you are already on takes you to the feed. */
function useTabClick() {
  const pathname = usePathname();
  const router = useRouter();
  const current = activeTab(pathname);
  return (href: string) => (e: React.MouseEvent) => {
    if (current?.href === href) { e.preventDefault(); router.push(FEED); }
  };
}

const tabClass = (active: boolean) =>
  `flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold leading-tight tracking-tight whitespace-nowrap min-[360px]:text-xs ${active ? "text-primary" : "text-muted"}`;

/** What a visitor's bottom bar needs to open the full site menu from its More tab. */
export type VisitorMenu = { groups: NavGroup[]; lang: Lang; labels: MenuLabels };

/**
 * The five-tab bottom bar on phones and folding phones (below 768px), for members and visitors alike.
 * Members: each tab opens its member page. Visitors (`visitor` set): tabs open the public page or sign-up, and More opens
 * the full site menu. Labels never wrap or cut off; each tap target is at least 56px tall.
 */
export function MemberBottomBar({ visitor }: { visitor?: VisitorMenu } = {}) {
  return visitor ? <VisitorBar menu={visitor} /> : <MemberBar />;
}

function MemberBar() {
  const pathname = usePathname();
  const onTab = useTabClick();
  useBackToFeed();
  const current = activeTab(pathname);
  return (
    <nav aria-label="Member tabs" data-shell="bottom-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = current?.key === t.key;
          return (
            <li key={t.key} className="min-w-0">
              <Link href={t.href} onClick={onTab(t.href)} aria-current={active ? "page" : undefined} data-tab={t.key} className={tabClass(active)}>
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

function VisitorBar({ menu }: { menu: VisitorMenu }) {
  const pathname = usePathname();
  const isOn = (href: string) => { const p = href.split("?")[0]; return pathname === p || pathname.startsWith(`${p}/`); };
  return (
    <nav aria-label="Quick links" data-shell="bottom-bar" data-visitor className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          if (t.key === "more") {
            return (
              <li key={t.key} className="min-w-0">
                <MobileMenu groups={menu.groups} lang={menu.lang} signedIn={false} labels={menu.labels}
                  trigger={(open, isOpen) => (
                    <button type="button" onClick={open} aria-expanded={isOpen} aria-controls="mobile-drawer" aria-haspopup="dialog" data-tab={t.key} className={tabClass(isOpen)}>
                      <TabIcon k={t.key} />
                      <span data-tab-label>{t.label}</span>
                    </button>
                  )} />
              </li>
            );
          }
          const active = !t.visitorHref.startsWith("/join") && isOn(t.visitorHref);
          return (
            <li key={t.key} className="min-w-0">
              <Link href={t.visitorHref} aria-current={active ? "page" : undefined} data-tab={t.key} className={tabClass(active)}>
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
