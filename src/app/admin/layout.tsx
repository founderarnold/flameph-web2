import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ADMIN_TABLES } from "@/lib/admin/config";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireStaff();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const tables = ADMIN_TABLES.filter((t) => t.roles.some((r) => roles.includes(r)));
  return (
    <div className="container-x grid gap-6 py-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Admin" className="lg:sticky lg:top-24 lg:self-start">
        <details open className="card p-3 lg:[&>summary]:hidden">
          <summary className="cursor-pointer font-bold">Admin menu</summary>
          <ul className="space-y-0.5 text-[15px]">
            <li><Link className="block rounded-lg px-2 py-2 font-bold hover:bg-bg-soft" href="/admin">Dashboard</Link></li>
            {isAdmin && <>
              <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/submissions">Form inbox</Link></li>
              <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/members">Members</Link></li>
              <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/directory">Directory verification</Link></li>
              <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/ai">Ka-FLAME AI review</Link></li>
              <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/settings">Settings</Link></li>
            </>}
            <li className="px-2 pt-3 text-xs font-bold uppercase text-muted">Content</li>
            {tables.map((t) => <li key={t.table}><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href={`/admin/content/${t.table}`}>{t.label}</Link></li>)}
          </ul>
        </details>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
