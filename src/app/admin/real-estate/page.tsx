import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { REAL_ESTATE_ADMIN_SECTIONS } from "@/lib/real-estate-admin";

export default async function RealEstateAdminHome() {
  const { db } = await adminContext(["super_admin", "admin"]);
  const sections = Object.entries(REAL_ESTATE_ADMIN_SECTIONS);
  const counts = await Promise.all(
    sections.map(async ([, config]) => {
      const [{ count: total }, { count: open }] = await Promise.all([
        db.from(config.table).select("id", { count: "exact", head: true }),
        db.from(config.table).select("id", { count: "exact", head: true }).in("status", config.statuses.filter((status) => !["closed", "inactive", "onboarded", "not_selected", "withdrawn"].includes(status))),
      ]);
      return { total: total ?? 0, open: open ?? 0 };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[.16em] text-mph">Mapiles Realty Corporate H</p>
        <h1 className="mt-1 text-3xl font-extrabold text-primary">Real Estate for MSMEs</h1>
        <p className="mt-2 max-w-3xl text-muted">Review property requests, referral-partner applications and career applications. Every record shown here is stored in the secure production Supabase database.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map(([section, config], index) => (
          <Link key={section} href={`/admin/real-estate/${section}`} className="card p-5 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md">
            <p className="text-sm font-bold uppercase tracking-wide text-muted">{config.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p><span className="text-4xl font-extrabold text-primary">{counts[index].total}</span><span className="ml-2 text-sm text-muted">total</span></p>
              <p className="rounded-full bg-flame-soft px-3 py-1 text-sm font-bold text-flame-strong">{counts[index].open} open</p>
            </div>
            <p className="mt-4 font-bold text-mph">Open {config.label.toLowerCase()} →</p>
          </Link>
        ))}
      </div>
      <div className="card p-5 text-sm text-muted">
        <p className="font-bold text-primary">Privacy reminder</p>
        <p className="mt-1">These records contain personal information. Download or share them only when needed for authorized FLAME PH and Mapiles Realty work.</p>
      </div>
    </div>
  );
}
