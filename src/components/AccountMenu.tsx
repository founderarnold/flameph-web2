"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MEMBER_LINKS, isActive } from "@/lib/member-nav";

/** Header "Account" button for signed-in members: opens the member menu so every member page is one click away from anywhere. */
export function AccountMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = usePathname();
  useEffect(() => setOpen(false), [p]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);
  return (
    <div ref={ref} className="relative hidden lg:block" onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} aria-controls="menu-account" onClick={() => setOpen(!open)} onMouseEnter={() => setOpen(true)} className="btn btn-ghost gap-1">
        {label}
        <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${open ? "rotate-180" : ""}`}><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      <div id="menu-account" hidden={!open} className="absolute right-0 top-full pt-2">
        <ul className="card w-64 p-2 shadow-lg">
          {MEMBER_LINKS.map((it) => (
            <li key={it.href}>
              <Link href={it.href} aria-current={isActive(p, it.href) ? "page" : undefined} onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-[15px] hover:bg-bg-soft ${isActive(p, it.href) ? "bg-primary-soft font-semibold text-primary" : ""}`}>{it.label}</Link>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-1">
            <form action="/auth/logout" method="post"><button className="flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-[15px] text-muted hover:bg-bg-soft">Log out</button></form>
          </li>
        </ul>
      </div>
    </div>
  );
}
