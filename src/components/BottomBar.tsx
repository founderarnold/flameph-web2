"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />,
  ai: <path d="M4 5h16v11H8l-4 4zM8 10h.01M12 10h.01M16 10h.01" />,
  dir: <path d="M4 7h16M4 12h16M4 17h10M3 4h18v16H3z" />,
  opp: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />,
  acct: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" />,
};

export function BottomBar({ labels }: { labels: { home: string; kaflame: string; directory: string; account: string } }) {
  const p = usePathname();
  const items = [
    { href: "/", label: labels.home, icon: "home", active: p === "/" },
    { href: "/opportunities", label: "Opportunities", icon: "opp", active: p.startsWith("/opportunities") || p.startsWith("/deals") },
    { href: "/bizconsult-ai", label: labels.kaflame, icon: "ai", active: p.startsWith("/bizconsult-ai") },
    { href: "/directory", label: labels.directory, icon: "dir", active: p.startsWith("/directory") },
    { href: "/account", label: labels.account, icon: "acct", active: p.startsWith("/account") || p === "/login" || p === "/join" },
  ];
  return (
    <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={it.active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${it.active ? "text-primary" : "text-muted"}`}>
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{ICONS[it.icon]}</svg>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
