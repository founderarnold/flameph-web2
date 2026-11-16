import nav from "@/content/nav.json";

export type NavItem = { label: string; href: string; external?: boolean };
export type NavGroup = { key: string; label: string; fil: string; items: NavItem[] };

export const NAV = nav as NavGroup[];

export const LEGAL_LINKS: NavItem[] = [
  { label: "Terms of Use", href: "/legal/terms" },
  { label: "Privacy Notice", href: "/legal/privacy" },
  { label: "Community Guidelines", href: "/membership/terms" },
  { label: "Contact", href: "/contact" },
  { label: "Impact", href: "/impact" },
];
