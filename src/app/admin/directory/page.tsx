import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { moderateBusiness, reviewLegacyBusiness, verifyBusiness } from "../actions";

export default async function DirectoryAdmin({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const { db, roles } = await adminContext(["super_admin", "admin"]);
  const isSuper = roles.includes("super_admin");
  let q = db.from("businesses").select("*").order("updated_at", { ascending: false }).limit(200);
  if (!sp.all) q = q.eq("verification_status", "pending");
  const { data: rows } = await q;
  const ownerIds = [...new Set((rows ?? []).map((business) => business.owner_id))];
  const [{ data: owners }, { data: reports }, { data: assessments }, { data: moderationEvents }] = await Promise.all([
    ownerIds.length ? db.from("profiles").select("id,member_code,full_name,status").in("id", ownerIds) : Promise.resolve({ data: [] }),
    db.from("submissions").select("id,user_id,data,status,created_at").eq("type", "business-report").order("created_at", { ascending: false }).limit(1000),
    db.from("business_legacy_assessments").select("business_id,classification,reason_codes,possible_duplicate,was_published,action_taken,review_state,assessed_at,reviewed_at,review_note").limit(1000),
    db.from("business_moderation_events").select("id,business_id,risk_level,reason_categories,suspicious_fields,assessment_version,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  const ownerById = new Map((owners ?? []).map((owner) => [owner.id, owner]));
  const reportsByBusiness = new Map<string, typeof reports>();
  const assessmentByBusiness = new Map((assessments ?? []).map((assessment) => [assessment.business_id, assessment]));
  const moderationByBusiness = new Map<string, typeof moderationEvents>();
  for (const report of reports ?? []) {
    const businessId = String((report.data as Record<string, unknown>)?.business_id ?? "");
    reportsByBusiness.set(businessId, [...(reportsByBusiness.get(businessId) ?? []), report]);
  }
  for (const event of moderationEvents ?? []) moderationByBusiness.set(event.business_id, [...(moderationByBusiness.get(event.business_id) ?? []), event]);
  const withLinks = await Promise.all((rows ?? []).map(async (b) => ({
    ...b,
    owner: ownerById.get(b.owner_id),
    reports: reportsByBusiness.get(b.id) ?? [],
    assessment: assessmentByBusiness.get(b.id),
    moderationHistory: moderationByBusiness.get(b.id) ?? [],
    docs: await Promise.all((b.verification_docs as string[]).map(async (p) => ({ p, url: (await db.storage.from("private-docs").createSignedUrl(p, 600)).data?.signedUrl }))),
  })));
  const assessmentRows = assessments ?? [];
  const totals = {
    total: assessmentRows.length,
    legitimate: assessmentRows.filter((x) => x.classification === "clearly_legitimate").length,
    incomplete: assessmentRows.filter((x) => x.classification === "incomplete").length,
    suspicious: assessmentRows.filter((x) => x.classification === "obviously_suspicious").length,
    uncertain: assessmentRows.filter((x) => x.classification === "uncertain").length,
    duplicates: assessmentRows.filter((x) => x.possible_duplicate).length,
    manual: assessmentRows.filter((x) => x.review_state === "pending").length,
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Directory verification</h1>
      <p className="text-muted">Review verification documents, user reports, visibility, and member safety actions. Suspended members are automatically removed from the public directory.</p>
      {totals.total > 0 && <section className="card p-4" aria-labelledby="legacy-summary"><h2 id="legacy-summary" className="font-bold">Legacy listing safety review</h2><p className="mt-1 text-sm text-muted">No records were deleted. Every original publication state remains recorded for rollback and manual review.</p><dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div><dt>Total</dt><dd className="font-bold">{totals.total}</dd></div><div><dt>Presumed legitimate</dt><dd className="font-bold">{totals.legitimate}</dd></div><div><dt>Incomplete</dt><dd className="font-bold">{totals.incomplete}</dd></div><div><dt>High suspicion</dt><dd className="font-bold">{totals.suspicious}</dd></div><div><dt>Uncertain</dt><dd className="font-bold">{totals.uncertain}</dd></div><div><dt>Duplicates</dt><dd className="font-bold">{totals.duplicates}</dd></div><div><dt>Manual review</dt><dd className="font-bold">{totals.manual}</dd></div></dl></section>}
      {sp.all && <p className="rounded-lg bg-primary-soft p-3 text-sm text-primary"><b>Moderation:</b> Hide is reversible. Ban suspends the member and hides all their listings. Permanent delete is available only to super admins.</p>}
      <p><Link className="text-mph underline" href={sp.all ? "/admin/directory" : "/admin/directory?all=1"}>{sp.all ? "Show pending only" : "Show all listings"}</Link></p>
      {withLinks.length === 0 ? <p className="text-muted">No listings to review.</p> : withLinks.map((b) => (
        <div key={b.id} className="card p-4">
          <p className="font-bold">{b.name} <span className="text-sm font-normal text-muted">· {b.sector} · {[b.city, b.province].filter(Boolean).join(", ")} · {b.published ? "published" : "hidden"} · {b.verification_status}{b.verified && " ✓"}</span></p>
          <p className="mt-1 text-sm">Owner: <b>{b.owner?.full_name ?? "Unknown member"}</b> · {b.owner?.member_code ?? b.owner_id} · <span className={b.owner?.status === "suspended" ? "font-bold text-flame-strong" : "text-ok"}>{b.owner?.status ?? "unknown"}</span></p>
          {b.published && <Link href="https://pages.flameph.org/directory" className="text-sm text-mph underline">View Pages directory</Link>}
          {b.reports.length > 0 && <details className="mt-3 rounded-lg border border-flame bg-flame-soft p-3"><summary className="cursor-pointer font-bold text-flame-strong">⚑ {b.reports.length} member report{b.reports.length === 1 ? "" : "s"}</summary><ul className="mt-2 space-y-2 text-sm">{b.reports.map((report: { id: string; data: Record<string, string>; status: string; created_at: string }) => <li key={report.id} className="rounded bg-card p-2"><b>{report.data.reason?.replace(/_/g, " ")}</b> · {new Date(report.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}<p className="whitespace-pre-line">{report.data.details}</p><span className="text-xs uppercase text-muted">{report.status}</span></li>)}</ul></details>}
          {b.assessment && <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer font-bold">Legacy assessment: {b.assessment.classification.replace(/_/g, " ")} · {b.assessment.review_state}</summary><p className="mt-2 text-sm text-muted">Signals: {(b.assessment.reason_codes as string[]).join(", ") || "none"} · Originally {b.assessment.was_published ? "published" : "private"}</p><form action={reviewLegacyBusiness} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"><input type="hidden" name="id" value={b.id} /><input name="note" className="input" placeholder="Review note" /><button name="legacy_decision" value="restore_public" className="btn btn-outline">Restore public</button><button name="legacy_decision" value="clear_review" className="btn btn-outline">Clear review</button><button name="legacy_decision" value="confirm_quarantine" className="btn btn-flame">Confirm quarantine</button></form></details>}
          {b.moderationHistory.length > 0 && <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer font-bold">Automatic moderation history ({b.moderationHistory.length})</summary><ul className="mt-2 space-y-2 text-sm">{b.moderationHistory.map((event: { id: number; risk_level: string; reason_categories: string[]; suspicious_fields: string[]; assessment_version: string; created_at: string }) => <li key={event.id}><b>{event.risk_level}</b> · {event.assessment_version} · {new Date(event.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}<br/><span className="text-muted">{[...event.reason_categories, ...event.suspicious_fields].join(", ") || "No flags"}</span></li>)}</ul></details>}
          <ul className="mt-2 space-y-1">{b.docs.map((d: { p: string; url?: string }) => <li key={d.p}><a className="text-mph underline" href={d.url ?? "#"} target="_blank" rel="noopener">{d.p.split("/").pop()}</a></li>)}</ul>
          <form action={verifyBusiness} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={b.id} />
            <input name="note" placeholder="Note to record (e.g. DTI cert no. checked)" className="input flex-1" aria-label="Verification note" defaultValue={b.verification_note ?? ""} />
            <button name="decision" value="approve" className="btn btn-primary">Approve</button>
            <button name="decision" value="reject" className="btn btn-outline">Reject</button>
            {b.published && <button name="decision" value="unpublish" className="btn btn-ghost">Unpublish</button>}
          </form>
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-sm font-bold uppercase text-muted">Safety and moderation</p>
            <form action={moderateBusiness} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={b.id} />
              {b.published ? <button name="moderation_action" value="hide" className="btn btn-outline">Hide listing</button> : b.owner?.status === "active" && <button name="moderation_action" value="restore" className="btn btn-outline">Restore listing</button>}
              <button name="moderation_action" value="approve_legitimate" className="btn btn-outline">Approve legitimate</button>
              <button name="moderation_action" value="request_correction" className="btn btn-outline">Request correction</button>
              <button name="moderation_action" value="keep_quarantined" className="btn btn-outline">Keep quarantined</button>
              <button name="moderation_action" value="reject" className="btn btn-outline">Reject</button>
              <button name="moderation_action" value="suspend" className="btn btn-outline">Suspend listing</button>
              {b.owner?.status !== "suspended" && <button name="moderation_action" value="ban_owner" className="btn btn-flame">Ban owner + hide all listings</button>}
            </form>
            {isSuper && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-flame-strong">Permanently delete this business…</summary><form action={moderateBusiness} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="moderation_action" value="delete_business" /><label className="text-sm">Type DELETE to confirm<input name="confirmation" className="input mt-1 w-40" autoComplete="off" /></label><button className="btn btn-flame">Delete permanently</button></form></details>}
          </div>
        </div>
      ))}
    </div>
  );
}
