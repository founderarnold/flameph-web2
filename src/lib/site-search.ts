import { NAV } from "@/lib/nav";

export type SiteSearchItem = {
  title: string;
  href: string;
  section: string;
  keywords: string;
};

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

export const SITE_SEARCH_ITEMS = Array.from(
  new Map([...coreItems, ...navItems].map((item) => [item.href, item])).values(),
);

export function searchSite(query: string, limit = 12) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  return SITE_SEARCH_ITEMS
    .map((item) => {
      const haystack = `${item.title} ${item.section} ${item.keywords}`.toLowerCase();
      const score = terms.reduce((total, term) => {
        if (item.title.toLowerCase() === term) return total + 8;
        if (item.title.toLowerCase().startsWith(term)) return total + 5;
        if (item.title.toLowerCase().includes(term)) return total + 3;
        return haystack.includes(term) ? total + 1 : total;
      }, 0);
      return { item, score, matches: terms.every((term) => haystack.includes(term)) };
    })
    .filter((result) => result.matches)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, limit)
    .map((result) => result.item);
}
