import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db, isAdmin } = await adminContext();
  const { data: stats } = await db.rpc("public_stats");
  const [newSubs, pending, thumbsDown] = await Promise.all([
    db.from("submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("businesses").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    db.from("ai_feedback").select("id", { count: "exact", head: true }).eq("helpful", false).eq("reviewed", false),
  ]);
  const s = (stats ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-primary">Admin dashboard</h1>
      {sp.denied && <Notice>You don&apos;t have permission for that.</Notice>}
      {sp.error === "service-key" && <Notice>SUPABASE_SERVICE_ROLE_KEY is not set, so admin tools can&apos;t run.</Notice>}
      {isAdmin && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/admin/submissions?status=new" className="card p-4 hover:border-primary"><p className="text-sm text-muted">New form submissions</p><p className="text-3xl font-extrabold">{newSubs.count ?? 0}</p></Link>
          <Link href="/admin/directory" className="card p-4 hover:border-primary"><p className="text-sm text-muted">Businesses awaiting verification</p><p className="text-3xl font-extrabold">{pending.count ?? 0}</p></Link>
          <Link href="/admin/ai" className="card p-4 hover:border-primary"><p className="text-sm text-muted">Unreviewed 👎 AI answers</p><p className="text-3xl font-extrabold">{thumbsDown.count ?? 0}</p></Link>
        </div>
      )}
      <div className="card p-5">
        <h2 className="text-lg font-bold">Live statistics</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["members", "Members"], ["members_this_month", "New this month"], ["provinces", "Provinces"], ["businesses", "Listed businesses"], ["verified_businesses", "Verified"], ["active_chapters", "Active chapters"], ["events_held", "Events held"], ["ai_answers", "AI answers"]].map(([k, l]) => (
            <div key={k}><dt className="text-sm text-muted">{l}</dt><dd className="text-2xl font-extrabold">{s[k] ?? "—"}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
