import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { adminFlash, COMPLAINT_STATUS, ISSUES, overdue, SEVERITY, SEVERITY_KEYS, when, type ComplaintStatus, type Issue, type Severity } from "@/lib/partner-cases";

export const metadata = { title: "Partner complaints", robots: { index: false } };

type Row = { id: string; ref_no: string; partner_name: string; issue: Issue | null; status: ComplaintStatus; severity: Severity; submitted_at: string | null; first_response_due_at: string | null; resolve_due_at: string | null; assigned_to: string | null };
const FILTERS: [string, string][] = [["active", "Being worked on"], ["open", "New"], ["appealed", "Appeals"], ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All sent"]];
const ACTIVE: ComplaintStatus[] = ["open", "investigating", "corrective_action", "appealed"];
const sevTone = (s: Severity) => (s === "critical" ? "bg-danger-soft text-danger" : s === "high" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary");

/** Every sent complaint about accredited partners, most urgent first, with overdue flags against the response targets. */
export default async function ComplaintsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; severity?: string; late?: string; done?: string; error?: string; why?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "active";
  const sev = sp.severity && sp.severity in SEVERITY ? (sp.severity as Severity) : null;
  let q = ctx.db.from("partner_complaints").select("id, ref_no, partner_name, issue, status, severity, submitted_at, first_response_due_at, resolve_due_at, assigned_to").neq("status", "draft").order("submitted_at", { ascending: false }).limit(300);
  if (status === "active") q = q.in("status", ACTIVE);
  else if (status !== "all") q = q.eq("status", status);
  if (sev) q = q.eq("severity", sev);
  const [{ data, error }, { data: all }] = await Promise.all([q, ctx.db.from("partner_complaints").select("status, severity, first_response_due_at, resolve_due_at").neq("status", "draft").limit(5000)]);
  let rows = ((data ?? []) as Row[]).sort((a, b) => SEVERITY_KEYS.indexOf(a.severity) - SEVERITY_KEYS.indexOf(b.severity));
  if (sp.late === "1") rows = rows.filter((r) => overdue(r));
  const allRows = (all ?? []) as Pick<Row, "status" | "severity" | "first_response_due_at" | "resolve_due_at">[];
  const lateCount = allRows.filter((r) => overdue(r)).length;
  const flash = adminFlash(sp);
  const link = (k: string, extra = "") => `/admin/partners/complaints?status=${k}${sev ? `&severity=${sev}` : ""}${extra}`;

  return (
    <div className="space-y-4">
      <PartnerTabs current="complaints" />
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Partner complaints</h1>
        <p className="text-sm text-muted">Complaints from members about accredited partners&apos; orders and services. Only the national team works on them; appeals go to the founder. <Link href="/admin/partners/complaints/settings" className="underline">Response targets and penalty terms</Link></p>
      </div>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {error && <Notice tone="warn">Complaints open after the database update (0035).</Notice>}
      {lateCount > 0 && <Notice tone="danger"><Link href={link("all", "&late=1")} className="underline">{lateCount} complaint{lateCount > 1 ? "s are" : " is"} past the target time.</Link></Notice>}

      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => <Link key={k} href={link(k)} aria-current={k === status && sp.late !== "1" ? "page" : undefined} className="chip shrink-0">{l}</Link>)}
      </nav>
      <nav aria-label="Filter by severity" className="flex gap-2 overflow-x-auto pb-1">
        <Link href={`/admin/partners/complaints?status=${status}`} aria-current={!sev ? "page" : undefined} className="chip shrink-0">All severities</Link>
        {SEVERITY_KEYS.map((k) => <Link key={k} href={`/admin/partners/complaints?status=${status}&severity=${k}`} aria-current={sev === k ? "page" : undefined} className="chip shrink-0">{SEVERITY[k].label} <span className="text-muted">{allRows.filter((r) => r.severity === k && ACTIVE.includes(r.status)).length}</span></Link>)}
      </nav>

      {rows.length === 0 ? <Notice tone="info">Nothing here.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const late = overdue(r);
            return (
              <li key={r.id} className={`card p-4 ${late ? "border-2 border-danger" : ""}`}>
                <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · {r.issue ? ISSUES[r.issue].label : "—"}</p>
                <Link href={`/admin/partners/complaints/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{r.partner_name}</Link>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 font-bold ${sevTone(r.severity)}`}>{SEVERITY[r.severity].label}</span>
                  <strong>{COMPLAINT_STATUS[r.status].label}</strong>
                </p>
                <p className="mt-1 text-sm text-muted">Sent {when(r.submitted_at)}{r.assigned_to ? "" : " · nobody in charge yet"}</p>
                {late && <p className="text-sm font-bold text-danger">{late === "first_response" ? `First reply was due ${when(r.first_response_due_at)}` : `Resolution was due ${when(r.resolve_due_at)}`}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
