import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { reviewBusinessModeration, reviewLegacyBusiness, verifyBusiness } from "../actions";

type LegacyAssessment = {
  business_id: string;
  classification: "clearly_legitimate" | "incomplete" | "obviously_suspicious" | "uncertain";
  reason_codes: string[];
  possible_duplicate: boolean;
  action_taken: "kept_public" | "queued_for_review" | "quarantined" | "restored_public" | "confirmed_quarantine";
  review_state: "pending" | "cleared" | "confirmed";
};

type ModerationEvent = {
  business_id: string;
  risk_level: string;
  reason_categories: string[];
  suspicious_fields: string[];
  created_at: string;
};

const legacyLabels: Record<LegacyAssessment["classification"], string> = {
  clearly_legitimate: "Presumed legitimate",
  incomplete: "Incomplete",
  obviously_suspicious: "High suspicion",
  uncertain: "Uncertain",
};

const legacyLabel = (classification: LegacyAssessment["classification"]) => legacyLabels[classification];

export default async function DirectoryAdmin({ searchParams }: { searchParams: Promise<{ all?: string; legacy?: string; risk?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const [{ data: businessRows }, { data: assessmentData, error: assessmentError }, { data: moderationEvents }] = await Promise.all([
    db.from("businesses").select("*").order("updated_at", { ascending: false }).limit(200),
    db.from("business_legacy_assessments").select("*").order("assessed_at", { ascending: false }),
    db.from("business_moderation_events").select("business_id,risk_level,reason_categories,suspicious_fields,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  const assessments = (assessmentData ?? []) as LegacyAssessment[];
  const assessmentByBusiness = new Map(assessments.map((row) => [row.business_id, row]));
  const rows = (businessRows ?? []).filter((business) => {
    if (sp.all) return true;
    if (sp.legacy) return assessmentByBusiness.get(business.id)?.review_state === "pending";
    if (sp.risk) return business.risk_level === "high" || business.risk_level === "needs_review";
    return business.verification_status === "pending";
  });
  const ownerIds = [...new Set(rows.map((business) => business.owner_id).filter(Boolean))];
  const { data: owners } = ownerIds.length ? await db.from("profiles").select("id,full_name,status").in("id", ownerIds) : { data: [] };
  const ownerById = new Map((owners ?? []).map((owner) => [owner.id, owner]));
  const eventHistory = new Map<string, ModerationEvent[]>();
  for (const event of (moderationEvents ?? []) as ModerationEvent[]) eventHistory.set(event.business_id, [...(eventHistory.get(event.business_id) ?? []), event]);
  const withLinks = await Promise.all(rows.map(async (b) => ({
    ...b,
    legacy: assessmentByBusiness.get(b.id),
    owner: ownerById.get(b.owner_id),
    moderationHistory: eventHistory.get(b.id) ?? [],
    docs: await Promise.all((b.verification_docs as string[]).map(async (p) => ({ p, url: (await db.storage.from("private-docs").createSignedUrl(p, 600)).data?.signedUrl }))),
  })));
  const report = {
    total: assessments.length,
    legitimate: assessments.filter((a) => a.classification === "clearly_legitimate").length,
    incomplete: assessments.filter((a) => a.classification === "incomplete").length,
    suspicious: assessments.filter((a) => a.classification === "obviously_suspicious").length,
    uncertain: assessments.filter((a) => a.classification === "uncertain").length,
    duplicates: assessments.filter((a) => a.possible_duplicate).length,
    manualReview: assessments.filter((a) => a.review_state === "pending" && a.classification !== "clearly_legitimate").length,
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Directory verification</h1>
      {!assessmentError && report.total > 0 && (
        <section className="card p-4" aria-labelledby="legacy-report-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="legacy-report-heading" className="font-bold text-primary">Legacy protection report</h2>
              <p className="text-sm text-muted">No records were deleted. Only listings matching all three random-text signals were quarantined.</p>
            </div>
            <Link className="text-sm text-mph underline" href="/admin/directory?legacy=1">Review pending ({report.manualReview})</Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ["Total", report.total], ["Presumed legitimate", report.legitimate], ["Incomplete", report.incomplete],
              ["High suspicion", report.suspicious], ["Uncertain", report.uncertain], ["Duplicates", report.duplicates],
              ["Manual review", report.manualReview],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-border p-3"><dt className="text-xs text-muted">{label}</dt><dd className="text-xl font-extrabold text-primary">{value}</dd></div>)}
          </dl>
        </section>
      )}
      {assessmentError && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Legacy assessment data is not available yet. Apply migration 0005 before using the review queue.</p>}
      <p className="flex flex-wrap gap-4 text-sm">
        <Link className="text-mph underline" href="/admin/directory">Verification pending</Link>
        <Link className="text-mph underline" href="/admin/directory?legacy=1">Legacy review</Link>
        <Link className="text-mph underline" href="/admin/directory?risk=1">Moderation queue</Link>
        <Link className="text-mph underline" href="/admin/directory?all=1">All listings</Link>
      </p>
      {withLinks.length === 0 ? <p className="text-muted">No listings to review.</p> : withLinks.map((b) => (
        <div key={b.id} className="card p-4">
          <p className="font-bold">{b.name} <span className="text-sm font-normal text-muted">· {b.sector} · {[b.city, b.province].filter(Boolean).join(", ")} · {b.publication_status ?? (b.published ? "published" : "unpublished")} · {b.lifecycle_status ?? (b.published ? "approved" : "draft")} · documents: {b.verification_status}{b.verified && " ✓"}</span></p>
          <p className="mt-1 text-sm text-muted">Owner: {b.owner?.full_name || b.owner_id} · member {b.owner?.status || "unknown"} · listing created {new Date(b.created_at).toLocaleDateString("en-PH")}</p>
          {b.published && <Link href={`/directory/${b.slug}`} className="text-sm text-mph underline">View public page</Link>}
          {(b.risk_level === "high" || b.risk_level === "needs_review" || b.moderationHistory.length > 0) && (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p><strong>Moderation: {String(b.risk_level).replace("_", " ")}</strong> · corrections: {b.correction_count ?? 0} · assessments: {b.moderationHistory.length}</p>
              <p className="mt-1">Flagged fields: {(b.moderation_fields ?? []).join(", ").replaceAll("_", " ") || "none"}</p>
              <p>Reason categories: {(b.moderation_reason_categories ?? []).join(", ").replaceAll("_", " ") || "none"}</p>
              {b.moderationHistory[0] && <p>Latest assessment: {new Date(b.moderationHistory[0].created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>}
              <details className="mt-2"><summary className="cursor-pointer font-semibold">View listing content and assessment history</summary>
                <p className="mt-2 whitespace-pre-wrap"><strong>Description:</strong> {b.description || "—"}</p>
                <p className="mt-1 whitespace-pre-wrap"><strong>Products/services:</strong> {b.products || "—"}</p>
                <ul className="mt-2 list-disc pl-5">{b.moderationHistory.map((event: ModerationEvent, index: number) => <li key={`${event.created_at}-${index}`}>{new Date(event.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}: {event.risk_level} · {(event.reason_categories ?? []).join(", ") || "no signals"} · fields {(event.suspicious_fields ?? []).join(", ") || "none"}</li>)}</ul>
              </details>
              <form action={reviewBusinessModeration} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={b.id} /><input type="hidden" name="owner_id" value={b.owner_id} />
                <input name="note" placeholder="Moderation review note" className="input min-w-52 flex-1" aria-label="Moderation review note" />
                <button name="decision" value="approve_legitimate" className="btn btn-primary">Approve legitimate</button>
                <button name="decision" value="request_correction" className="btn btn-outline">Request correction</button>
                <button name="decision" value="keep_quarantined" className="btn btn-outline">Keep quarantined</button>
                <button name="decision" value="reject" className="btn btn-ghost">Reject</button>
                <button name="decision" value="suspend" className="btn btn-ghost">Suspend member</button>
              </form>
            </div>
          )}
          {b.legacy && (
            <div className="mt-3 rounded-xl border border-border bg-background p-3 text-sm">
              <p><strong>{legacyLabel(b.legacy.classification)}</strong> · {b.legacy.action_taken.replaceAll("_", " ")} · review {b.legacy.review_state}</p>
              <p className="mt-1 text-muted">Signals: {b.legacy.reason_codes.length ? b.legacy.reason_codes.join(", ").replaceAll("_", " ") : "none"}</p>
              {b.legacy.review_state === "pending" && b.legacy.classification !== "clearly_legitimate" && (
                <form action={reviewLegacyBusiness} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="note" placeholder="Review note" className="input min-w-52 flex-1" aria-label="Legacy review note" />
                  {b.legacy.action_taken === "quarantined" ? (
                    <>
                      <button name="decision" value="confirm_quarantine" className="btn btn-outline">Confirm quarantine</button>
                      <button name="decision" value="restore_public" className="btn btn-primary">Restore public listing</button>
                    </>
                  ) : (
                    <>
                      <button name="decision" value="clear_review" className="btn btn-primary">Clear and keep</button>
                      <button name="decision" value="confirm_quarantine" className="btn btn-outline">Quarantine</button>
                    </>
                  )}
                </form>
              )}
            </div>
          )}
          <ul className="mt-2 space-y-1">{b.docs.map((d: { p: string; url?: string }) => <li key={d.p}><a className="text-mph underline" href={d.url ?? "#"} target="_blank" rel="noopener">{d.p.split("/").pop()}</a></li>)}</ul>
          <form action={verifyBusiness} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={b.id} />
            <input name="note" placeholder="Note to record (e.g. DTI cert no. checked)" className="input flex-1" aria-label="Verification note" defaultValue={b.verification_note ?? ""} />
            <button name="decision" value="approve" className="btn btn-primary">Approve</button>
            <button name="decision" value="reject" className="btn btn-outline">Reject</button>
            {b.published && <button name="decision" value="unpublish" className="btn btn-ghost">Unpublish</button>}
          </form>
        </div>
      ))}
    </div>
  );
}
