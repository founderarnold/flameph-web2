"use client";
import Link from "next/link";
import { viaGo } from "@/lib/ecosystem";
import { useEffect, useRef, useState } from "react";
import type { NavGroup } from "@/lib/nav";
import type { Lang } from "@/lib/i18n";

export function DesktopNav({ groups, lang }: { groups: NavGroup[]; lang: Lang }) {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <nav ref={ref} aria-label="Main" className="order-last -mx-1 hidden w-full min-w-0 pb-1 md:block xl:order-none xl:mx-0 xl:ml-3 xl:w-auto xl:pb-0">
      <ul className="flex items-center gap-0.5">
        {groups.map((g, i) => {
          const isOpen = open === g.key;
          // The last two menus open to the left, so they stay on screen on tablets.
          const side = i >= groups.length - 2 ? "right-0" : "left-0";
          return (
            <li key={g.key} className="relative" onMouseLeave={() => isOpen && setOpen(null)}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`menu-${g.key}`}
                onClick={() => setOpen(isOpen ? null : g.key)}
                onMouseEnter={() => setOpen(g.key)}
                className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-sm font-semibold hover:bg-bg-soft lg:px-2.5"
              >
                {lang === "fil" ? g.fil : g.label}
                <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${isOpen ? "rotate-180" : ""}`}><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
              </button>
              <div id={`menu-${g.key}`} hidden={!isOpen} className={`absolute ${side} top-full pt-2`}>
                <ul className="card w-72 p-2 shadow-lg">
                  {g.items.map((it) => (
                    <li key={`${it.label}-${it.href}`}>
                      {it.external && viaGo(it.href, it.label) === it.href ? (
                        <a href={it.href} target="_blank" rel="noopener" className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-[15px] hover:bg-bg-soft" onClick={() => setOpen(null)}>
                          {it.label} <span aria-label="opens in a new tab">↗</span>
                        </a>
                      ) : (
                        <Link href={viaGo(it.href, it.label)} className="flex min-h-11 items-center rounded-lg px-3 py-2 text-[15px] hover:bg-bg-soft" onClick={() => setOpen(null)}>
                          {it.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
