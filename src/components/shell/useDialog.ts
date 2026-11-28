"use client";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Shared behaviour for the phone menu and the Create sheet:
 * - the page behind does not scroll while it is open, and keeps its place when it closes;
 * - Escape and the phone's back button close it (back does not leave the page);
 * - keyboard focus stays inside while open and goes back to the button that opened it;
 * - tapping a link closes it first, then opens the page (so Back from that page does not land on a closed menu).
 * `key` marks the extra history entry this dialog adds.
 */
export function useDialog({ open, setOpen, panel, key }: { open: boolean; setOpen: (v: boolean) => void; panel: React.RefObject<HTMLElement | null>; key: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // A page change from anywhere closes it.
  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  const close = useCallback(() => {
    if (typeof window !== "undefined" && window.history.state?.[key]) window.history.back(); // the popstate below closes it
    else setOpen(false);
  }, [key, setOpen]);

  /** Close, then go to `href`. */
  const go = useCallback((href: string) => {
    if (window.history.state?.[key]) { pending.current = href; window.history.back(); }
    else { setOpen(false); router.push(href); }
  }, [key, router, setOpen]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = "hidden";
    const state = window.history.state ?? {};
    if (!state[key]) window.history.pushState({ ...state, [key]: true }, "", window.location.href);
    const onPop = () => {
      setOpen(false);
      const to = pending.current;
      pending.current = null;
      if (to) setTimeout(() => router.push(to), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      body.style.overflow = before;
      opener.current?.focus?.({ preventScroll: true });
    };
  }, [open, key, close, panel, router, setOpen]);

  /** onClick for links inside: plain taps close first, then navigate. New-tab and modified clicks are left alone. */
  const linkClick = useCallback((href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(href);
  }, [go]);

  return { close, go, linkClick };
}
