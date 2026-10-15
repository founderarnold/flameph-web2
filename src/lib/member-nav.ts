import type { NavItem } from "@/lib/nav";

// One list for every place members navigate from: the tab bar on member pages, the header account menu and the phone menu.
export const MEMBER_LINKS: NavItem[] = [
  { href: "/account", label: "My account" },
  { href: "/account/business", label: "My business" },
  { href: "/account/inquiries", label: "Inquiries" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/deals", label: "Buy together" },
  { href: "/account/growth", label: "Growth path" },
  { href: "/account/rewards", label: "Rewards" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/ai", label: "FLAME AI history" },
];

export const isActive = (pathname: string, href: string) =>
  href === "/account" ? pathname === "/account" : pathname === href || pathname.startsWith(`${href}/`);
