import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ADMIN_TABLES } from "@/lib/admin/config";

export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { roles } = await requireStaff();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isModerator = isAdmin || roles.includes("chapter_leader");
  const tables = ADMIN_TABLES.filter((t) => t.roles.some((r) => roles.includes(r)));
  const Menu = () => (
    <ul className="space-y-0.5 text-[15px]">
      <li><Link className="block rounded-lg px-2 py-2 font-bold hover:bg-bg-soft" href="/admin">Dashboard</Link></li>
      <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/design-system">Design system</Link></li>
      {isModerator && <>
        <li className="px-2 pt-3 text-xs font-bold uppercase text-muted">Moderation</li>
        <li><Link className="block rounded-lg px-2 py-2 font-semibold hover:bg-bg-soft" href="/admin/moderation">Moderation queue</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/moderation/log">Audit log</Link></li>
        {isAdmin && <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/records">Transaction records</Link></li>}
        {isAdmin && <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/investors">Investor registrations</Link></li>}
        {isAdmin && <li><Link className="block rounded-lg px-2 py-2 font-semibold hover:bg-bg-soft" href="/admin/privacy">Privacy and security</Link></li>}
        {isAdmin && <li><Link className="block rounded-lg px-2 py-2 font-semibold hover:bg-bg-soft" href="/admin/release">Release</Link></li>}
        {roles.includes("super_admin") && <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/moderation/appeals">Appeals</Link></li>}
        {roles.includes("super_admin") && <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/moderation/policy">Policy</Link></li>}
      </>}
      {isAdmin && <>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/submissions">Form inbox</Link></li>
        <li className="px-2 pt-3 text-xs font-bold uppercase text-muted">Real estate</li>
        <li><Link className="block rounded-lg px-2 py-2 font-semibold hover:bg-bg-soft" href="/admin/real-estate">Real Estate overview</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/real-estate/properties">Property inquiries</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/real-estate/referrals">Referral partners</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/real-estate/careers">Career applications</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/members">Members</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/directory">Directory verification</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/ai">Ka-FLAME AI review</Link></li>
        <li><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href="/admin/settings">Settings</Link></li>
      </>}
      <li className="px-2 pt-3 text-xs font-bold uppercase text-muted">Content</li>
      {(isAdmin || roles.includes("editor")) && <li><Link className="block rounded-lg px-2 py-2 font-semibold hover:bg-bg-soft" href="/admin/workshop-gallery">Workshop gallery</Link></li>}
      {tables.map((t) => <li key={t.table}><Link className="block rounded-lg px-2 py-2 hover:bg-bg-soft" href={`/admin/content/${t.table}`}>{t.label}</Link></li>)}
    </ul>
  );
  return (
    <div className="container-x grid gap-6 py-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Admin" className="lg:sticky lg:top-24 lg:self-start">
        <details className="card p-3 lg:hidden">
          <summary className="cursor-pointer font-bold">Admin menu</summary>
          <div className="mt-2 max-h-[min(68vh,520px)] overflow-y-auto border-t border-line pt-2"><Menu /></div>
        </details>
        <div className="card hidden max-h-[calc(100vh-7rem)] overflow-y-auto p-3 lg:block"><Menu /></div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
