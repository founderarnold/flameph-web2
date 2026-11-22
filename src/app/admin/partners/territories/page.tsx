import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { EXCLUSIVITY, PARTNER_KINDS, reviewDue, shownStatus, TERRITORY_STATUS, type Exclusivity, type PartnerKind } from "@/lib/territory";

export const metadata = { title: "Partner territories", robots: { index: false } };

type Row = { id: string; partner_user_id: string; parent_id: string | null; partner_category: PartnerKind; category_label: string; exclusivity: Exclusivity; status: string; start_date: string | null; end_date: string | null; next_review_date: string | null; rights: string };
const FILTERS: [string, string][] = [["active", "Active"], ["draft", "Drafts"], ["suspended", "Suspended"], ["ended", "Ended"], ["cancelled", "Cancelled"], ["all", "All"]];
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";

/** Every territory appointment for the national team, with the reviews that are due and the nominations waiting. */
export default async function TerritoriesAdmin({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status! : "active";
  let q = ctx.db.from("territorial_appointments").select("id, partner_user_id, parent_id, partner_category, category_label, exclusivity, status, start_date, end_date, next_review_date, rights").order("created_at", { ascending: false }).limit(300);
  if (status !== "all") q = q.eq("status", status);
  const [{ data, error }, { data: all }, { count: waiting }] = await Promise.all([
    q, ctx.db.from("territorial_appointments").select("status, next_review_date").limit(5000),
    ctx.db.from("territory_nominations").select("id", { count: "exact", head: true }).eq("status", "submitted"),
  ]);
  const rows = (data ?? []) as Row[];
  const counts = (all ?? []).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {} as Record<string, number>);
  const due = (all ?? []).filter((r) => reviewDue(r as { status: string; next_review_date: string | null })).length;
  const ids = rows.map((r) => r.id);
  const [{ data: areas }, { data: profs }] = ids.length ? await Promise.all([
    ctx.db.from("territory_areas").select("appointment_id, label").in("appointment_id", ids),
    ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", [...new Set(rows.map((r) => r.partner_user_id))]),
  ]) : [{ data: [] }, { data: [] }];
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));
  const areasOf = (id: string) => (areas ?? []).filter((a) => a.appointment_id === id).map((a) => a.label as string);

  return (
    <div className="space-y-4">
      <PartnerTabs current="territories" />
      <div>
        <h1 className="text-2xl font-extrabold text-primary">Partner territories</h1>
        <p className="text-sm text-muted">Who is appointed where, for which category, on which channels and until when. Only the national team appoints, suspends or ends. Two appointments for the same category, channels and dates cannot overlap where one is exclusive, unless you approve the overlap with a written reason.</p>
      </div>
      {sp.error && <Notice tone="danger">{sp.error === "missing" ? "That appointment was not found." : "That didn't go through."}</Notice>}
      {error && <Notice tone="warn">Territories open after the database update (0033).</Notice>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/admin/partners/territories/new" className="btn btn-flame min-h-11">New appointment</Link>
        <Link href="/admin/partners/territories/nominations" className="btn btn-outline min-h-11">Sub-partner nominations{waiting ? ` (${waiting} waiting)` : ""}</Link>
        <p className={`flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-bold ${due ? "bg-warn-soft text-warn" : "bg-bg-soft text-muted"}`}>{due ? `${due} performance review${due > 1 ? "s" : ""} due` : "No reviews due"}</p>
      </div>

      <nav aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/partners/territories?status=${k}`} aria-current={k === status ? "page" : undefined} className="chip shrink-0">
            {l}{k !== "all" && <span className="text-muted"> {counts[k] ?? 0}</span>}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? <Notice tone="info">{status === "active" ? "No active appointments yet. Start one with New appointment, usually after a Best Offer is chosen." : "Nothing here."}</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const s = shownStatus(r); const list = areasOf(r.id);
            return (
              <li key={r.id} className="card min-w-0 p-4">
                <p className="text-xs font-bold uppercase text-muted">{PARTNER_KINDS[r.partner_category]}{r.rights === "manufacturing" ? " · manufacturing" : ""}{r.parent_id ? " · sub-partner" : ""}</p>
                <Link href={`/admin/partners/territories/${r.id}`} className="block break-words text-lg font-extrabold text-primary underline">{nameOf.get(r.partner_user_id) ?? "—"}</Link>
                <p className="break-words text-[15px]">{r.category_label}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2.5 py-0.5 font-bold ${tone(s.tone)}`}>{s.label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 font-bold ${r.exclusivity === "exclusive" ? "bg-flame text-white" : "bg-bg-soft"}`}>{EXCLUSIVITY[r.exclusivity].label}</span>
                </p>
                <p className="mt-1 break-words text-sm">{list.length ? `${list.slice(0, 3).join("; ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}` : <span className="text-muted">No area yet</span>}</p>
                <p className="text-sm text-muted">{day(r.start_date)} to {day(r.end_date)}{reviewDue(r) ? " · review due" : r.next_review_date && ["active", "suspended"].includes(r.status) ? ` · next review ${day(r.next_review_date)}` : ""}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Status words: {Object.values(TERRITORY_STATUS).map((v) => v.label).join(", ")}. An active appointment past its end date shows as Expired and no longer blocks others.</p>
    </div>
  );
}
