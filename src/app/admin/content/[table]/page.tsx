import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { getAdminTable, PK } from "@/lib/admin/config";
import { Notice } from "@/components/ui";

const fmt = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "✓" : "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
  if (typeof v === "string" && v.includes("/") && v.length > 40) return "file ✓";
  return String(v);
};

export default async function ContentList({ params, searchParams }: { params: Promise<{ table: string }>; searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  const { table } = await params;
  const sp = await searchParams;
  const cfg = getAdminTable(table);
  if (!cfg) notFound();
  const { db, onlyChapterLeader, chapterIds } = await adminContext(cfg.roles);
  const pk = PK[table] ?? "id";
  let q = db.from(table).select("*").order(cfg.order.column, { ascending: cfg.order.ascending }).limit(500);
  if (onlyChapterLeader) q = table === "chapters" ? q.in("id", chapterIds) : q.in("chapter_id", chapterIds);
  const { data: rows } = await q;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-primary">{cfg.label}</h1>
        {!(onlyChapterLeader && table === "chapters") && <Link href={`/admin/content/${table}/new`} className="btn btn-primary">New {cfg.singular}</Link>}
      </div>
      {sp.saved && <Notice tone="ok">Saved.</Notice>}
      {sp.deleted && <Notice tone="ok">Deleted.</Notice>}
      {(rows ?? []).length === 0 ? <p className="text-muted">Nothing here yet.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="border-b border-line bg-bg-soft"><tr>{cfg.columns.map((c) => <th key={c} className="px-3 py-2 font-semibold">{c.replace(/_/g, " ")}</th>)}<th className="px-3 py-2"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>
              {(rows ?? []).map((r: Record<string, unknown>) => (
                <tr key={String(r[pk])} className="border-b border-line last:border-0">
                  {cfg.columns.map((c) => <td key={c} className="px-3 py-2">{fmt(r[c])}</td>)}
                  <td className="px-3 py-2"><Link className="font-semibold text-mph underline" href={`/admin/content/${table}/${r[pk]}`}>Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
