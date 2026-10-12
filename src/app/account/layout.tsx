import Link from "next/link";
import { requireUser, isStaffRole } from "@/lib/auth";

export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireUser();
  const tabs = [
    { href: "/account", label: "Dashboard" },
    { href: "/account/profile", label: "Profile" },
    { href: "/account/business", label: "My business" },
    { href: "/account/ai", label: "Ka-FLAME history" },
    ...(isStaffRole(roles) ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <div className="container-x py-8">
      <nav aria-label="Account" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {tabs.map((t) => <li key={t.href}><Link href={t.href} className="btn btn-outline whitespace-nowrap px-3 text-sm">{t.label}</Link></li>)}
          <li><form action="/auth/logout" method="post"><button className="btn btn-ghost whitespace-nowrap px-3 text-sm">Log out</button></form></li>
        </ul>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  );
}
