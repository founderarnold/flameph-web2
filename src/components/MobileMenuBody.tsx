"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar } from "./ui";
import * as I from "./icons";
import { ACTIONS } from "./EcosystemFrontDoor";
import { goHref, viaGo } from "@/lib/ecosystem";
import { isActive } from "@/lib/member-nav";
import { FEED } from "@/lib/member-shell";
import { searchSite } from "@/lib/site-search";
import type { Lang } from "@/lib/i18n";
import {
  GOAL_EXTRAS, GOAL_GROUPS, MENU_TITLE, PLATFORMS, QUICK_SHORTCUTS, SECTIONS, WORKSPACE_LINKS,
  hrefFor, visibleTo, type MenuLink, type MenuMember,
} from "@/lib/mobile-menu";
import type { MenuLabels } from "./MobileMenu";

// The inside of the phone menu. Loaded only when needed (when the phone is idle after the page loads, or on the first tap
// of Menu), so pages don't get heavier for people who never open it.

const ICONS: Record<string, () => React.ReactElement> = {
  briefcase: I.IconBriefcase, spark: I.IconSpark, award: I.IconAward, book: I.IconBook, users: I.IconUsers, hands: I.IconHands, store: I.IconStore, id: I.IconId, home: I.IconHome, chart: I.IconChart,
};
const SHORTCUT_ICONS = [I.IconCart, I.IconBox, I.IconPos];

const Chevron = ({ open }: { open: boolean }) => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 12 12" className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
);

type Click = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => void;

export default function MenuBody({ lang, signedIn, member, labels, linkClick, go }: { lang: Lang; signedIn: boolean; member: MenuMember | null; labels: MenuLabels; linkClick: Click; go: (href: string) => void }) {
  const pathname = usePathname();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const staff = !!member?.staff;
  const results = useMemo(() => searchSite(query, 12, { signedIn, staff }), [query, signedIn, staff]);
  const toggle = (k: string) => setOpenKey((cur) => (cur === k ? null : k));

  /** One menu row. Internal pages (and /go/ links to MarketplacePH and NegosyoDepot) close the menu first. */
  const row = (link: MenuLink, sub?: string) => {
    const target = hrefFor(link, signedIn);
    const href = link.external ? viaGo(target, link.label) : target;
    const newTab = link.newTab || /^https?:/.test(href);
    const on = !newTab && isActive(pathname, href.split(/[?#]/)[0]);
    const cls = `flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2 text-[15px] leading-snug hover:bg-bg-soft focus-visible:outline-2 ${on ? "bg-primary-soft font-semibold text-primary" : "text-fg"}`;
    const body = (
      <>
        <span className="min-w-0">
          <span className="block">{link.label}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {link.status && <span className="rounded-full bg-bg-soft px-2 py-0.5 text-[11px] font-bold text-muted">{link.status}</span>}
          {newTab && <><span aria-hidden className="text-muted">↗</span><span className="sr-only">(opens a new tab)</span></>}
        </span>
      </>
    );
    return newTab
      ? <a href={href} target="_blank" rel="noopener" className={cls}>{body}</a>
      : <Link href={href} onClick={linkClick(href)} aria-current={on ? "page" : undefined} className={cls}>{body}</Link>;
  };

  /** A level-1 row that opens its level-2 links. */
  const group = (k: string, label: string, children: React.ReactNode, sub?: string, icon?: string) => {
    const isOpen = openKey === k;
    const Icon = icon ? ICONS[icon] : null;
    return (
      <li key={k} className="border-b border-line">
        <button type="button" onClick={() => toggle(k)} aria-expanded={isOpen} aria-controls={`menu-${k}`} id={`menu-${k}-btn`}
          className="flex min-h-12 w-full items-center gap-3 py-2 text-left text-base font-bold">
          {Icon && <span aria-hidden className="text-primary"><Icon /></span>}
          <span className="min-w-0 flex-1">
            <span className="block">{label}</span>
            {sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
          </span>
          <Chevron open={isOpen} />
        </button>
        <ul id={`menu-${k}`} role="list" aria-labelledby={`menu-${k}-btn`} hidden={!isOpen} className="pb-3">{children}</ul>
      </li>
    );
  };

  const cards = (titles: string[]) => titles.map((t) => ACTIONS.find((a) => a.title === t)).filter((a): a is (typeof ACTIONS)[number] => !!a);

  return (
    <nav aria-label="Menu" className="flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
      {/* Account: Join and Log in for visitors; the member's name, photo and tier for members. */}
      {member ? (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} src={member.avatar} size={48} />
            <div className="min-w-0">
              <p className="truncate font-bold">{member.name}</p>
              <p className="text-sm text-muted">{member.tier} member</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/workspace" onClick={linkClick("/workspace")} className="btn btn-primary min-h-12 px-2 text-sm">My FLAME Workspace</Link>
            <Link href="/account/settings" onClick={linkClick("/account/settings")} className="btn btn-outline min-h-12 px-2 text-sm">Profile &amp; settings</Link>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/join" onClick={linkClick("/join")} className="btn btn-flame min-h-12">Join for Free</Link>
          <Link href="/login" onClick={linkClick("/login")} className="btn btn-outline min-h-12">{labels.login}</Link>
        </div>
      )}

      <form role="search" className="mt-3" onSubmit={(e) => { e.preventDefault(); if (query.trim()) go(`/search?q=${encodeURIComponent(query.trim())}`); }}>
        <label htmlFor="menu-search" className="sr-only">Search the menu</label>
        <input id="menu-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off"
          placeholder="Search tools, programs, services..." className="input min-h-12 w-full text-base" aria-describedby="menu-search-hint" />
        <p id="menu-search-hint" className="sr-only">Type in English or Filipino, for example puhunan, trabaho or tipid.</p>
      </form>

      {query.trim() ? (
        <section aria-label="Search results" className="mt-2" aria-live="polite">
          {results.length ? (
            <ul role="list">
              {results.map((r) => <li key={r.href}>{row({ label: r.title, href: r.href, external: r.external }, r.section)}</li>)}
            </ul>
          ) : <p className="px-3 py-4 text-sm text-muted">No matching page yet. Try another word, like benta, puhunan or training.</p>}
          <Link href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={linkClick(`/search?q=${encodeURIComponent(query.trim())}`)} className="mt-1 flex min-h-12 items-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary-soft">See all search results →</Link>
        </section>
      ) : (
        <>
          <ul role="list" className="mt-2">
            <li>{row({ label: "Home", href: signedIn ? FEED : "/" })}</li>
          </ul>

          {/* Big shortcuts: these stay one tap away after the bottom bar changed (owner, 28 Nov 2026). */}
          <ul role="list" aria-label="Shortcuts" className="mt-1 grid grid-cols-3 gap-2">
            {QUICK_SHORTCUTS.map((s, i) => {
              const href = hrefFor(s, signedIn);
              const Icon = SHORTCUT_ICONS[i];
              return (
                <li key={s.label}>
                  <Link href={href} onClick={linkClick(href)} data-shortcut className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-line px-1 py-2 text-center text-[13px] font-bold leading-tight hover:border-primary">
                    <span aria-hidden className="text-primary"><Icon /></span>{s.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <h3 className="mt-5 font-display text-base font-extrabold text-primary">{MENU_TITLE}</h3>
          <ul role="list">
            {GOAL_GROUPS.map((g) => group(g.key, g.label, <>
              {(GOAL_EXTRAS[g.key] ?? []).map((l) => <li key={l.label}>{row(l)}</li>)}
              {cards(g.cards).map((a) => <li key={a.title}>{row({ label: a.title, href: a.href, external: a.external })}</li>)}
            </>, g.text))}
            <li className="border-b border-line">{row({ label: "See all 28 goals", href: "/start" })}</li>
          </ul>

          <ul role="list" className="mt-4 border-t border-line">
            {member && (
              group("workspace", "My FLAME Workspace", WORKSPACE_LINKS.map((l) => <li key={l.href}>{row(l)}</li>), undefined, "chart")
            )}
            {member && member.roleLinks.length > 0 && (
              group("dashboards", "My Dashboards", member.roleLinks.map((l) => <li key={l.href}>{row(l)}</li>), "For your role at FLAME PH", "id")
            )}
            {SECTIONS.map((s) => (
              group(s.key, lang === "fil" ? s.fil : s.label, s.links.filter((l) => visibleTo(l, signedIn)).map((l) => <li key={`${l.label}-${l.href}`}>{row(l)}</li>), undefined, s.icon)
            ))}
          </ul>

          <section aria-labelledby="menu-eco-h" className="mt-5">
            <h3 id="menu-eco-h" className="font-display text-base font-extrabold text-primary">FLAME PH ecosystem</h3>
            <p className="text-xs text-muted">Your FLAME PH account also signs you in on MarketplacePH and NegosyoDepot.</p>
            <ul role="list" className="mt-2 grid gap-2">
              {PLATFORMS.map((p) => {
                const body = (
                  <>
                    <Image src={p.logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-contain" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{p.name}{p.here && <span className="ml-2 text-xs font-bold uppercase text-flame-strong">You are here</span>}</span>
                      <span className="block text-xs text-muted">{p.text}</span>
                    </span>
                    {p.newTab && <><span aria-hidden className="text-muted">↗</span><span className="sr-only">(opens a new tab)</span></>}
                  </>
                );
                const cls = "flex min-h-12 items-center gap-3 rounded-xl border border-line p-2 hover:border-primary";
                if (p.here) return <li key={p.key}><div aria-current="page" className={`${cls} border-2 border-primary`}>{body}</div></li>;
                if (p.newTab) return <li key={p.key}><a href={p.href} target="_blank" rel="noopener" className={cls}>{body}</a></li>;
                const href = goHref(p.key as "marketplaceph" | "negosyodepot");
                return <li key={p.key}><Link href={href} onClick={linkClick(href)} className={cls}>{body}</Link></li>;
              })}
            </ul>
          </section>

          <ul role="list" className="mt-5 border-t border-line pt-2">
            {member && <li>{row({ label: "See every page (More)", href: "/more" })}</li>}
            <li>{row({ label: "Help & Support", href: "/contact" })}</li>
          </ul>
          {member && (
            <form action="/auth/logout" method="post" className="mt-3">
              <button className="btn btn-outline min-h-12 w-full">Log Out</button>
            </form>
          )}
        </>
      )}
    </nav>
  );
}
