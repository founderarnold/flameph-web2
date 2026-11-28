import { NAV } from "@/lib/nav";
import MORE from "@/content/more.json";
import { SYNONYMS, allMenuLinks } from "@/lib/mobile-menu";

export type SiteSearchItem = {
  title: string;
  href: string;
  section: string;
  keywords: string;
  external?: boolean;
  /** "member": only signed-in members see it in results; "staff": only staff. Default: everyone. */
  who?: "all" | "member" | "staff";
};

/** Who is searching. Results only show pages this person can open (the pages still check on the server). */
export type SearchAudience = { signedIn: boolean; staff?: boolean };

const coreItems: SiteSearchItem[] = [
  { title: "FLAME PH Home", href: "/", section: "Home", keywords: "homepage ano ang gusto mong gawin ngayon for your business ecosystem digital workspace" },
  { title: "Join FLAME PH", href: "/join", section: "Account", keywords: "register sign up become a member free membership" },
  { title: "Member Account", href: "/account", section: "Account", keywords: "profile digital id rewards business page login" },
  { title: "News & Updates", href: "/news", section: "Explore", keywords: "announcements activities events bulletin" },
  { title: "Contact FLAME PH", href: "/contact", section: "About", keywords: "email support inquiry help" },
];

const navItems: SiteSearchItem[] = NAV.flatMap((group) =>
  group.items
    .filter((item) => !item.external)
    .map((item) => ({
      title: item.label,
      href: item.href,
      section: group.label,
      keywords: `${item.label} ${group.label}`,
    })),
);

// The phone menu's links (with their Filipino keywords) and the members' More pages.
const menuItems: SiteSearchItem[] = allMenuLinks().map(({ link, section }) => ({
  title: link.label, href: link.href, section, keywords: `${link.label} ${section} ${link.keywords ?? ""}`,
  external: link.external, who: link.who === "member" ? "member" : "all",
}));

/** Pages that need sign-in (they send visitors to Log in). Everything else in More is a public page. */
const MEMBER_ONLY = /^\/(account|home|new-post|workspace|messages|requests|records|friends|groups|members|more|welcome|group-order|partner-us\/.+)(\/|$|[?#])/;

type MoreGroup = { key: string; title: string; staffOnly?: boolean; items: { label: string; href: string; external?: boolean }[] };
const moreItems: SiteSearchItem[] = (MORE.groups as MoreGroup[]).flatMap((g) => g.items.map((it) => ({
  title: it.label, href: it.href, section: g.title, keywords: `${it.label} ${g.title}`, external: it.external,
  who: g.staffOnly ? "staff" as const : MEMBER_ONLY.test(it.href) ? "member" as const : "all" as const,
})));

// One entry per address. Words from every list are kept, and the widest audience wins (a public page stays public).
const rank = { all: 0, member: 1, staff: 2 } as const;
function merge(items: SiteSearchItem[]) {
  const by = new Map<string, SiteSearchItem>();
  for (const it of items) {
    const had = by.get(it.href);
    if (!had) { by.set(it.href, { ...it }); continue; }
    had.keywords = `${had.keywords} ${it.title} ${it.keywords}`;
    if (rank[it.who ?? "all"] < rank[had.who ?? "all"]) had.who = it.who ?? "all";
    had.external = had.external || it.external;
  }
  return [...by.values()];
}
export const SITE_SEARCH_ITEMS = merge([...coreItems, ...navItems, ...menuItems, ...moreItems]);

const canSee = (item: SiteSearchItem, a: SearchAudience) =>
  (item.who ?? "all") === "all" || (item.who === "member" ? a.signedIn : !!a.staff);

/** A search word and the words it stands for (Filipino and everyday words). */
const expand = (term: string) => [term, ...(SYNONYMS[term] ?? [])];

export function searchSite(query: string, limit = 12, audience: SearchAudience = { signedIn: false }) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return SITE_SEARCH_ITEMS
    .filter((item) => canSee(item, audience))
    .map((item) => {
      const title = item.title.toLowerCase();
      const haystack = `${item.title} ${item.section} ${item.keywords}`.toLowerCase();
      const score = terms.reduce((total, term) => {
        if (title === term) return total + 8;
        if (title.startsWith(term)) return total + 5;
        if (title.includes(term)) return total + 3;
        // A Filipino word the page is tagged with (puhunan, trabaho…) counts more than a word it only stands for.
        if (haystack.includes(term)) return total + (SYNONYMS[term] ? 4 : 1);
        return expand(term).some((w) => title.includes(w)) ? total + 2 : expand(term).some((w) => haystack.includes(w)) ? total + 1 : total;
      }, 0);
      return { item, score, matches: terms.every((term) => expand(term).some((w) => haystack.includes(w))) };
    })
    .filter((result) => result.matches)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((result) => result.item);
}
