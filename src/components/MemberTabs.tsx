"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isActive } from "@/lib/member-nav";
import type { NavItem } from "@/lib/nav";

export function MemberTabs({ tabs }: { tabs: NavItem[] }) {
  const p = usePathname();
  const ref = useRef<HTMLUListElement>(null);
  const current = tabs.find((t) => isActive(p, t.href));
  // On phones the tab row scrolls sideways; keep the current tab in view so members can see where they are.
  useEffect(() => { ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" }); }, [p]);
  return (
    <div>
      {current && current.href !== "/account" && (
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/account" className="font-semibold text-mph underline">← My account</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="font-semibold text-fg">{current.label.replace(/ \(\d+\)$/, "")}</li>
          </ol>
        </nav>
      )}
      <nav aria-label="Member menu" className="-mx-4 overflow-x-auto px-4 pb-1">
        <ul ref={ref} className="flex gap-2">
          {tabs.map((t) => {
            const on = current?.href === t.href;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={on ? "page" : undefined} className={`btn whitespace-nowrap px-3 text-sm ${on ? "btn-primary" : "btn-outline"}`}>{t.label}</Link>
              </li>
            );
          })}
          <li><form action="/auth/logout" method="post"><button className="btn btn-ghost whitespace-nowrap px-3 text-sm">Log out</button></form></li>
        </ul>
      </nav>
    </div>
  );
}
