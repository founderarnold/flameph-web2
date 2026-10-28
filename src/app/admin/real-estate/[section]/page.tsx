import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { getRealEstateAdminSection, humanizeRealEstateField } from "@/lib/real-estate-admin";
import { setRealEstateStatus } from "../../actions";

type AdminRow = Record<string, unknown> & {
  id: string;
  reference_number: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  status: string;
  source?: string | null;
  created_at: string;
  updated_at: string;
};

const displayValue = (value: unknown) => {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export default async function RealEstateAdminList({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ status?: string; saved?: string }>;
}) {
  const [{ section }, sp] = await Promise.all([params, searchParams]);
  const config = getRealEstateAdminSection(section);
  if (!config) notFound();
  const { db } = await adminContext(["super_admin", "admin"]);
  let query = db.from(config.table).select("*").order("created_at", { ascending: false }).limit(200);
  if (sp.status && config.statuses.includes(sp.status as never)) query = query.eq("status", sp.status);
  const { data, error } = await query;
  const rows = (data ?? []) as AdminRow[];
  const exportQuery = sp.status ? `?status=${encodeURIComponent(sp.status)}` : "";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/real-estate" className="text-sm font-bold text-mph underline">← Real Estate overview</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold text-primary">{config.label}</h1>
            <p className="text-sm text-muted">Showing up to 200 newest records.</p>
          </div>
          <a href={`/admin/export/${config.exportKind}${exportQuery}`} className="btn btn-outline">Download CSV</a>
        </div>
      </div>
      {sp.saved && <p className="rounded-xl bg-ok-soft px-4 py-3 font-semibold text-ok">Status updated.</p>}
      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto" aria-label="Status filter">
          <option value="">All statuses</option>
          {config.statuses.map((status) => <option key={status} value={status}>{humanizeRealEstateField(status)}</option>)}
        </select>
        <button className="btn btn-primary">Filter</button>
        <Link href={`/admin/real-estate/${section}`} className="btn btn-ghost">Clear</Link>
      </form>
      {error && <p className="rounded-xl bg-flame-soft p-4 text-flame-strong">The records could not be loaded. Please try again.</p>}
      {!error && rows.length === 0 && <div className="card p-6 text-muted">No {config.label.toLowerCase()} found.</div>}
      {rows.map((row) => {
        const details = (row[config.dataColumn] ?? {}) as Record<string, unknown>;
        return (
          <details key={row.id} className="card p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold uppercase text-primary">{humanizeRealEstateField(row.status)}</span>
                  <span className="ml-2 font-extrabold text-primary">{row.name || "Unnamed applicant"}</span>
                  <span className="ml-2 font-mono text-xs text-muted">{row.reference_number}</span>
                </div>
                <time className="text-sm text-muted">{new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</time>
              </div>
            </summary>
            <div className="mt-4 grid gap-5 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <dl className="grid gap-2 text-[15px] sm:grid-cols-2">
                <div><dt className="font-bold text-muted">Reference</dt><dd>{row.reference_number}</dd></div>
                <div><dt className="font-bold text-muted">Name</dt><dd>{row.name || "—"}</dd></div>
                <div><dt className="font-bold text-muted">Email</dt><dd>{row.email ? <a className="underline" href={`mailto:${row.email}`}>{row.email}</a> : "—"}</dd></div>
                <div><dt className="font-bold text-muted">Mobile</dt><dd>{row.mobile ? <a className="underline" href={`tel:${row.mobile}`}>{row.mobile}</a> : "—"}</dd></div>
                {row.source && <div><dt className="font-bold text-muted">Source</dt><dd>{row.source}</dd></div>}
                {Object.entries(details).map(([key, value]) => (
                  <div key={key} className={typeof value === "string" && value.length > 120 ? "sm:col-span-2" : ""}>
                    <dt className="font-bold text-muted">{humanizeRealEstateField(key)}</dt>
                    <dd className="whitespace-pre-wrap break-words">{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
              <form action={setRealEstateStatus} className="h-fit rounded-xl bg-bg-soft p-4">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="section" value={section} />
                <label className="text-sm font-bold" htmlFor={`status-${row.id}`}>Update status</label>
                <select id={`status-${row.id}`} name="status" defaultValue={row.status} className="input mt-2 w-full">
                  {config.statuses.map((status) => <option key={status} value={status}>{humanizeRealEstateField(status)}</option>)}
                </select>
                <button className="btn btn-primary mt-3 w-full">Save status</button>
              </form>
            </div>
          </details>
        );
      })}
    </div>
  );
}
