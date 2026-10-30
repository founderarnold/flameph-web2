"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { NavGroup } from "@/lib/nav";
import type { Lang } from "@/lib/i18n";
import { MEMBER_LINKS, isActive } from "@/lib/member-nav";

type Labels = { menu: string; close: string; login: string; account: string; joinFree: string };

export function MobileMenu({ groups, lang, signedIn, labels }: { groups: NavGroup[]; lang: Lang; signedIn: boolean; labels: Labels }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-drawer" className="btn btn-ghost h-11 w-11 p-0" aria-label={labels.menu}>
        <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      {/* Portal to <body>: the header's backdrop-blur makes it the containing block for fixed children, which squashed the drawer to header height. */}
      {open && createPortal(
        <div id="mobile-drawer" role="dialog" aria-modal="true" aria-label={labels.menu} className="fixed inset-0 z-50 flex flex-col bg-bg">
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="font-display text-lg font-extrabold text-primary">{labels.menu}</span>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost h-11 w-11 p-0" aria-label={labels.close} autoFocus>
              <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 pb-8">
            {signedIn && (
              <details open className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-lg font-bold">
                  {labels.account}
                  <svg aria-hidden width="16" height="16" viewBox="0 0 12 12" className="transition-transform group-open:rotate-180"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                </summary>
                <ul className="pb-3">
                  {MEMBER_LINKS.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} aria-current={isActive(pathname, it.href) ? "page" : undefined}
                        className={`flex min-h-11 items-center rounded-lg px-3 text-base hover:bg-bg-soft ${isActive(pathname, it.href) ? "bg-primary-soft font-semibold text-primary" : "text-muted"}`}>{it.label}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {groups.map((g) => (
              <details key={g.key} className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-lg font-bold">
                  {lang === "fil" ? g.fil : g.label}
                  <svg aria-hidden width="16" height="16" viewBox="0 0 12 12" className="transition-transform group-open:rotate-180"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                </summary>
                <ul className="pb-3">
                  {g.items.map((it) => (
                    <li key={`${it.label}-${it.href}`}>
                      {it.external ? (
                        <a href={it.href} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-lg px-3 text-base text-muted hover:bg-bg-soft">{it.label} ↗</a>
                      ) : (
                        <Link href={it.href} className="flex min-h-11 items-center rounded-lg px-3 text-base text-muted hover:bg-bg-soft">{it.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <div className="mt-6 grid gap-3">
              {signedIn ? (
                <Link href="/account" className="btn btn-outline w-full">{labels.account}</Link>
              ) : (
                <>
                  <Link href="/join" className="btn btn-flame w-full">{labels.joinFree}</Link>
                  <Link href="/login" className="btn btn-outline w-full">{labels.login}</Link>
                </>
              )}
            </div>
          </nav>
        </div>,
        document.body,
      )}
    </div>
  );
}
