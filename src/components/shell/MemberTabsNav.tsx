"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { FEED, TABS, activeTab } from "@/lib/member-shell";
import { TabIcon } from "./TabIcon";

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

/** Five-tab bottom bar for signed-in members (phones and tablets). Labels never wrap or cut off; each tap target is at least 56px tall. */
export function MemberBottomBar() {
  const pathname = usePathname();
  const onTab = useTabClick();
  useBackToFeed();
  const current = activeTab(pathname);
  return (
    <nav aria-label="Member tabs" data-shell="bottom-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = current?.key === t.key;
          return (
            <li key={t.key} className="min-w-0">
              <Link href={t.href} onClick={onTab(t.href)} aria-current={active ? "page" : undefined} data-tab={t.key}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold leading-tight tracking-tight whitespace-nowrap min-[360px]:text-xs ${active ? "text-primary" : "text-muted"}`}>
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

/** The same five tabs inline in the top bar on wide screens, where the bottom bar is hidden. */
export function MemberTopTabs() {
  const pathname = usePathname();
  const onTab = useTabClick();
  const current = activeTab(pathname);
  return (
    <nav aria-label="Member tabs" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = current?.key === t.key;
          return (
            <li key={t.key}>
              <Link href={t.href} onClick={onTab(t.href)} aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold whitespace-nowrap hover:bg-bg-soft ${active ? "bg-primary-soft text-primary" : "text-fg"}`}>
                <TabIcon k={t.key} />{t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
