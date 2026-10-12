import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { setSubmissionStatus } from "../actions";
import { FORMS } from "@/lib/forms";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ type?: string; status?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  let q = db.from("submissions").select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.type) q = q.eq("type", sp.type);
  if (sp.status) q = q.eq("status", sp.status);
  const { data: rows } = await q;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-primary">Form inbox</h1>
        <a href={`/admin/export/submissions${qs ? `?${qs}` : ""}`} className="btn btn-outline">Export CSV</a>
      </div>
      <form className="flex flex-wrap gap-2">
        <select name="type" defaultValue={sp.type ?? ""} className="input w-auto" aria-label="Form type"><option value="">All forms</option>{Object.values(FORMS).map((f) => <option key={f.type} value={f.type}>{f.title}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto" aria-label="Status"><option value="">Any status</option><option>new</option><option>contacted</option><option>done</option></select>
        <button className="btn btn-primary">Filter</button>
        <Link href="/admin/submissions" className="btn btn-ghost">Clear</Link>
      </form>
      {(rows ?? []).length === 0 ? <p className="text-muted">No submissions.</p> : (rows ?? []).map((r) => (
        <details key={r.id} className="card p-4">
          <summary className="cursor-pointer">
            <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-bold uppercase ${r.status === "new" ? "bg-flame-soft text-flame-strong" : r.status === "contacted" ? "bg-primary-soft text-primary" : "bg-ok-soft text-ok"}`}>{r.status}</span>
            <b>{FORMS[r.type]?.title ?? r.type}</b> · {r.name ?? "—"} · <span className="text-sm text-muted">{new Date(r.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</span>
          </summary>
          <dl className="mt-3 grid gap-1 text-[15px]">
            {r.email && <div><dt className="inline font-semibold">Email: </dt><dd className="inline"><a className="underline" href={`mailto:${r.email}`}>{r.email}</a></dd></div>}
            {r.mobile && <div><dt className="inline font-semibold">Mobile: </dt><dd className="inline">{r.mobile}</dd></div>}
            {Object.entries(r.data as Record<string, string>).map(([k, v]) => <div key={k}><dt className="inline font-semibold">{k.replace(/_/g, " ")}: </dt><dd className="inline whitespace-pre-line">{v}</dd></div>)}
          </dl>
          <form action={setSubmissionStatus} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={r.id} />
            <select name="status" defaultValue={r.status} className="input w-auto" aria-label="Status"><option>new</option><option>contacted</option><option>done</option></select>
            <input name="notes" defaultValue={r.notes ?? ""} placeholder="Internal notes" className="input flex-1" aria-label="Notes" />
            <button className="btn btn-primary">Update</button>
          </form>
        </details>
      ))}
    </div>
  );
}
