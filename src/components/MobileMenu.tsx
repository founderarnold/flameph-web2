"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "./Logo";
import { TAGLINES } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import type { MenuMember } from "@/lib/mobile-menu";
import { useDialog } from "./shell/useDialog";

const loadBody = () => import("./MobileMenuBody");
/** The menu's links and search load on their own, after the page (see the preload below), not with every page. */
const MenuBody = dynamic(loadBody, { ssr: false, loading: () => <p className="p-4 text-sm text-muted" role="status">Opening the menu…</p> });

export type MenuLabels = { menu: string; close: string; login: string; account: string; joinFree: string };

export type { MenuMember };

/**
 * The phone menu (below 768px), for visitors and members. Opened by the Menu tab on the bottom bar (`trigger`).
 * Full screen on narrow phones, 90% wide on larger ones. Fixed header with a visible close button; the content scrolls on
 * its own. Sections open one at a time and go two levels deep at most. Uses the built-in menu list
 * (src/lib/mobile-menu.ts): no database call when it opens.
 */
export function MobileMenu({ lang, signedIn, member, labels, trigger }: { lang: Lang; signedIn: boolean; member?: MenuMember | null; labels: MenuLabels; trigger?: (open: () => void, isOpen: boolean) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { close, go, linkClick } = useDialog({ open, setOpen, panel, key: "flMenu" });
  // Get the menu ready while the phone is idle after the page loads, so the first tap opens it at once.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(() => void loadBody()) : window.setTimeout(() => void loadBody(), 2000);
    return () => { if (!w.requestIdleCallback) window.clearTimeout(t); };
  }, []);

  return (
    <div className="md:hidden">
      {trigger ? trigger(() => setOpen(true), open) : (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="site-menu" aria-haspopup="dialog" className="btn btn-ghost h-12 w-12 p-0" aria-label="Open the menu">
          <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      )}
      {/* Portal to <body>: the header's backdrop-blur makes it the containing block for fixed children. */}
      {open && createPortal(
        <div id="site-menu" role="dialog" aria-modal="true" aria-labelledby="site-menu-title" data-shell="menu" className="fixed inset-0 z-50 flex justify-end">
          <button type="button" tabIndex={-1} aria-hidden onClick={close} className="absolute inset-0 hidden cursor-default bg-black/40 min-[480px]:block" />
          <div ref={panel} className="relative flex h-dvh w-full flex-col bg-bg shadow-xl min-[480px]:w-[90vw] min-[480px]:max-w-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
              <div className="min-w-0">
                <h2 id="site-menu-title" className="sr-only">{labels.menu}</h2>
                <Logo link={false} height={34} className="h-[34px] w-auto" />
                <p className="mt-0.5 text-xs font-semibold leading-tight text-muted">{TAGLINES.main}</p>
              </div>
              <button type="button" onClick={close} data-autofocus className="btn btn-outline h-12 w-12 shrink-0 p-0" aria-label={`${labels.close} menu`}>
                <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <MenuBody lang={lang} signedIn={signedIn} member={member ?? null} labels={labels} linkClick={linkClick} go={go} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
