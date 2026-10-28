import Link from "next/link";

const LINKS = [
  { href: "/real-estate-for-msmes", label: "Overview" },
  { href: "/real-estate-for-msmes/find-property", label: "Find Property" },
  { href: "/real-estate-for-msmes/referral-partner", label: "Referral Program" },
  { href: "/real-estate-for-msmes/careers", label: "Careers" },
];

export function RealEstateNav() {
  return (
    <nav aria-label="Real Estate for MSMEs" className="border-b border-line bg-bg-soft">
      <div className="container-x flex gap-1 overflow-x-auto py-2">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary-soft">
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
