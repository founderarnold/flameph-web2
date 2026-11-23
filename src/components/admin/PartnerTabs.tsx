import Link from "next/link";

const TABS = [
  ["applications", "Applications", "/admin/partners"],
  ["offers", "Supplier offers", "/admin/partners/offers"],
  ["territories", "Territories", "/admin/partners/territories"],
  ["commissions", "Commissions", "/admin/partners/commissions"],
] as const;

/** The national team's partner sections (Admin > Partners): applications, supplier offers, territories and commissions. */
export function PartnerTabs({ current }: { current: (typeof TABS)[number][0] }) {
  return (
    <nav aria-label="Partner sections" className="flex gap-2 overflow-x-auto">
      {TABS.map(([k, l, href]) => <Link key={k} href={href} aria-current={k === current ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
    </nav>
  );
}
