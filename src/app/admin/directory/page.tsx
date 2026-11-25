import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { moderateBusiness, reviewLegacyBusiness, runDirectoryAutoCheck, verifyBusiness } from "../actions";
import { DOC_TYPES, type DocType } from "@/lib/vetting";
import { DIRECTORY_VIEWS, PAGE_SIZE, applyView, pageInfo, viewOf, waitingLabel, type DirectoryView } from "@/lib/business-review-queue";
import { isNoteOnly, reasonLabel } from "@/lib/listing-review-rules";
import { SubmitButton } from "@/components/SubmitButton";

type SP = { view?: string; all?: string; page?: string; q?: string; sort?: string; done?: string; error?: string; name?: string; checked?: string; published?: string; held?: string; failed?: string };

const DONE: Record<string, string> = {
  approve_legitimate: "is now published on the business directory. It shows on flameph.org and pages.flameph.org/directory within about a minute.",
  restore: "is public again on the business directory.",
  hide: "is hidden from the directory. You can restore it any time.",
  request_correction: "was sent back to the owner to correct.",
  keep_quarantined: "stays off the directory (high suspicion).",
  reject: "was rejected and is not public.",
  suspend: "was suspended and is not public.",
  ban_owner: ": the owner is banned and all their listings are hidden.",
  delete_business: "was permanently deleted.",
  doc_approve: "now has the Verified badge.",
  doc_reject: ": documents were rejected (the listing itself is unchanged).",
  doc_unpublish: "is hidden from the directory.",
  legacy_restore_public: "(older listing) was restored to public.",
  legacy_clear_review: "(older listing) review was cleared.",
  legacy_confirm_quarantine: "(older listing) stays quarantined.",
};
const ERRORS: Record<string, string> = {
  "owner-suspended": "The owner's account is not active, so this listing can't be published. Restore the member first in Admin > Members.",
  "save-failed": "The database refused the change. Nothing was changed. Please try again; if it keeps happening, tell FLAME PH support.",
  "not-published": "The change was saved but the listing is still not public. Check the reasons on the listing.",
  "not-found": "That listing no longer exists. The list below is up to date.",
  "delete-confirm": "To delete permanently, type DELETE in the box first.",
  "legacy-review": "The older-listing review could not be saved. Please try again.",
  "unknown-action": "That button is out of date. The page has been refreshed; please try again.",
};
const STATUS_CHIP: Record<string, [string, string]> = {
  live: ["On the directory", "bg-ok-soft text-ok"],
  waiting: ["Waiting", "bg-warn-soft text-warn"],
  high: ["High suspicion", "bg-flame-soft text-flame-strong"],
  off: ["Not public", "bg-bg-soft text-muted"],
};
const when = (d: string) => new Date(d).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export default async function DirectoryAdmin({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db, roles } = await adminContext(["super_admin", "admin"]);
  const isSuper = roles.includes("super_admin");
  const view = viewOf(sp.view, sp.all);
  const search = (sp.q ?? "").trim().slice(0, 80);
  const oldest = sp.sort === "oldest";

  // Address of this exact view, used by the pager and so every button brings the admin back to the same place.
  const href = (over: Partial<Record<"view" | "page" | "q" | "sort", string | undefined>>) => {
    const p = new URLSearchParams();
    const v = { view, q: search || undefined, sort: oldest ? "oldest" : undefined, page: undefined as string | undefined, ...over };
    if (v.view && v.view !== "review") p.set("view", v.view);
    if (v.q) p.set("q", v.q);
    if (v.sort) p.set("sort", v.sort);
    if (v.page && v.page !== "1") p.set("page", v.page);
    const s = p.toString();
    return `/admin/directory${s ? `?${s}` : ""}`;
  };

  // Counts for every tab, then the rows of the current tab and page.
  const counts = Object.fromEntries(await Promise.all(DIRECTORY_VIEWS.map(async ({ key }) => {
    const { count } = await applyView(db.from("businesses").select("id", { count: "exact", head: true }), key);
    return [key, count ?? 0] as const;
  }))) as Record<DirectoryView, number>;
  const like = search.replace(/[%_,()*]/g, " ").trim();
  let countQ = applyView(db.from("businesses").select("id", { count: "exact", head: true }), view);
  if (like) countQ = countQ.or(`name.ilike.*${like}*,city.ilike.*${like}*,province.ilike.*${like}*`);
  const { count: total = 0 } = await countQ;
  const pg = pageInfo(Number(sp.page ?? 1), total ?? 0);
  let q = applyView(db.from("businesses").select("*"), view).order("updated_at", { ascending: oldest }).range(Math.max(0, pg.from - 1), Math.max(0, pg.from - 1) + PAGE_SIZE - 1);
  if (like) q = q.or(`name.ilike.*${like}*,city.ilike.*${like}*,province.ilike.*${like}*`);
  const { data: rows } = total ? await q : { data: [] };

  const ownerIds = [...new Set((rows ?? []).map((business) => business.owner_id))];
  const ids = (rows ?? []).map((b) => b.id);
  const [{ data: owners }, { data: reports }, { data: assessments }, { data: allAssessments }, { data: moderationEvents }] = await Promise.all([
    ownerIds.length ? db.from("profiles").select("id,member_code,full_name,status,email_verified_at").in("id", ownerIds) : Promise.resolve({ data: [] }),
    db.from("submissions").select("id,user_id,data,status,created_at").eq("type", "business-report").order("created_at", { ascending: false }).limit(1000),
    ids.length ? db.from("business_legacy_assessments").select("business_id,classification,reason_codes,possible_duplicate,was_published,action_taken,review_state,assessed_at,reviewed_at,review_note").in("business_id", ids) : Promise.resolve({ data: [] }),
    db.from("business_legacy_assessments").select("classification,possible_duplicate,review_state").limit(1000),
    ids.length ? db.from("business_moderation_events").select("id,business_id,risk_level,reason_categories,suspicious_fields,assessment_version,created_at").in("business_id", ids).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [] }),
  ]);
  const emails = new Map(await Promise.all(ownerIds.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id).catch(() => ({ data: { user: null } }));
    return [id, data?.user?.email ?? null] as const;
  })));
  // Vetting documents (Phase 8A): encrypted; opened one at a time through the server, which logs each view.
  const { data: vetDocs } = ownerIds.length
    ? await db.from("vetting_documents").select("*").in("user_id", ownerIds).is("deleted_at", null).order("uploaded_at", { ascending: false })
    : { data: [] };
  const vetByOwner = new Map<string, { id: string; doc_type: string; file_name: string; uploaded_at: string }[]>();
  // Partner application files (0031) are reviewed in Admin > Partners, not here.
  for (const d of ((vetDocs ?? []) as { id: string; user_id: string; doc_type: string; file_name: string; uploaded_at: string; purpose?: string }[]).filter((x) => (x.purpose ?? "vetting") === "vetting")) vetByOwner.set(d.user_id, [...(vetByOwner.get(d.user_id) ?? []), d]);
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
    email: emails.get(b.owner_id) ?? null,
    reports: reportsByBusiness.get(b.id) ?? [],
    assessment: assessmentByBusiness.get(b.id),
    moderationHistory: moderationByBusiness.get(b.id) ?? [],
    docs: await Promise.all(((b.verification_docs ?? []) as string[]).map(async (p) => ({ p, url: (await db.storage.from("private-docs").createSignedUrl(p, 600)).data?.signedUrl }))),
  })));
  const assessmentRows = allAssessments ?? [];
  const totals = {
    total: assessmentRows.length,
    legitimate: assessmentRows.filter((x) => x.classification === "clearly_legitimate").length,
    incomplete: assessmentRows.filter((x) => x.classification === "incomplete").length,
    suspicious: assessmentRows.filter((x) => x.classification === "obviously_suspicious").length,
    uncertain: assessmentRows.filter((x) => x.classification === "uncertain").length,
    duplicates: assessmentRows.filter((x) => x.possible_duplicate).length,
    manual: assessmentRows.filter((x) => x.review_state === "pending").length,
  };
  const here = href({ page: String(pg.current) });
  const current = DIRECTORY_VIEWS.find((v) => v.key === view)!;

  const Pager = ({ label }: { label: string }) => total ? (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-2 text-sm">
      <span className="px-2 text-muted">Showing <b className="text-ink">{pg.from}–{pg.to}</b> of <b className="text-ink">{total}</b> · page {pg.current} of {pg.last}</span>
      <span className="flex gap-2">
        {pg.hasPrev ? <Link className="btn btn-outline btn-sm" href={href({ page: "1" })}>⏮ First</Link> : <span className="btn btn-outline btn-sm opacity-40" aria-disabled>⏮ First</span>}
        {pg.hasPrev ? <Link className="btn btn-outline btn-sm" rel="prev" href={href({ page: String(pg.current - 1) })}>← Back</Link> : <span className="btn btn-outline btn-sm opacity-40" aria-disabled>← Back</span>}
        {pg.hasNext ? <Link className="btn btn-primary btn-sm" rel="next" href={href({ page: String(pg.current + 1) })}>Next →</Link> : <span className="btn btn-primary btn-sm opacity-40" aria-disabled>Next →</span>}
      </span>
    </nav>
  ) : null;

  return (
    <div id="top" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">Directory verification</h1>
          <p className="mt-1 max-w-2xl text-muted">Listings that look normal go on the business directory by themselves. Only listings with a warning sign wait here, each with the reasons. Documents are optional and only add the Verified badge.</p>
        </div>
        <form action={runDirectoryAutoCheck}>
          <input type="hidden" name="return_to" value={here} />
          <SubmitButton className="btn btn-outline" pendingText="Checking…">Check waiting listings now</SubmitButton>
        </form>
      </div>

      {sp.done === "auto_check" && <p role="status" className="rounded-lg bg-ok-soft p-3 text-sm font-semibold text-ok">Checked {sp.checked ?? 0} waiting listing{sp.checked === "1" ? "" : "s"}: {sp.published ?? 0} published, {sp.held ?? 0} still need a look{Number(sp.failed) ? `, ${sp.failed} could not be checked (try again)` : ""}.</p>}
      {sp.done && sp.done !== "auto_check" && DONE[sp.done] && <p role="status" className="rounded-lg bg-ok-soft p-3 text-sm font-semibold text-ok">✓ {sp.name ? <b>{sp.name}</b> : "The listing"} {DONE[sp.done]}</p>}
      {sp.error && <p role="alert" className="rounded-lg bg-flame-soft p-3 text-sm font-semibold text-flame-strong">{sp.name ? <><b>{sp.name}</b>: </> : null}{ERRORS[sp.error] ?? "Something went wrong. Nothing was changed."}</p>}

      <nav aria-label="Listing groups" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {DIRECTORY_VIEWS.map((v) => (
          <Link key={v.key} href={href({ view: v.key, page: undefined })} aria-current={v.key === view ? "page" : undefined}
            className={`rounded-xl border p-3 transition ${v.key === view ? "border-primary bg-primary-soft" : "border-line bg-card hover:bg-bg-soft"}`}>
            <span className={`block text-2xl font-extrabold ${v.key === "review" && counts.review ? "text-warn" : v.key === "flagged" ? "text-flame-strong" : "text-primary"}`}>{counts[v.key]}</span>
            <span className="block text-sm font-bold">{v.label}</span>
          </Link>
        ))}
      </nav>
      <p className="text-sm text-muted"><b className="text-ink">{current.label}:</b> {current.help}</p>

      <form method="get" action="/admin/directory" className="flex flex-wrap items-end gap-2" role="search">
        {view !== "review" && <input type="hidden" name="view" value={view} />}
        <label className="min-w-0 flex-1 text-sm font-semibold">Find a listing
          <input name="q" defaultValue={search} placeholder="Business name, city or province" className="input mt-1 w-full" />
        </label>
        <label className="text-sm font-semibold">Order
          <select name="sort" defaultValue={oldest ? "oldest" : ""} className="input mt-1">
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <button className="btn btn-primary">Search</button>
        {(search || oldest) && <Link className="btn btn-ghost" href={href({ q: undefined, sort: undefined, page: undefined })}>Clear</Link>}
      </form>

      <Pager label="Pages (top)" />

      {withLinks.length === 0 ? (
        <p className="rounded-xl border border-line bg-card p-6 text-center text-muted">{view === "review" ? "Nothing needs a look right now. New listings that look normal are published automatically." : "No listings here."}</p>
      ) : withLinks.map((b) => {
        const status = b.published ? "live" : b.risk_level === "high" ? "high" : waitingLabel(b) ? "waiting" : "off";
        const stored = ((b.moderation_reason_categories ?? []) as string[]);
        const legacyCodes = b.assessment && b.assessment.review_state !== "cleared" ? (b.assessment.reason_codes as string[]) : [];
        const codes = [...new Set([...stored, ...legacyCodes, ...(b.assessment?.review_state === "pending" ? [b.assessment.classification === "obviously_suspicious" ? "legacy_high_suspicion" : "legacy_review"] : [])])];
        const holds = codes.filter((c) => !isNoteOnly(c));
        const notes = codes.filter(isNoteOnly);
        const checked = b.moderation_version || b.assessment;
        return (
          <article key={b.id} id={`b-${b.id}`} className="card scroll-mt-24 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold">{b.name}</h2>
                <p className="text-sm text-muted">{[b.sector, [b.city, b.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ")} · saved {when(b.updated_at)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_CHIP[status][1]}`}>{STATUS_CHIP[status][0]}{b.verified && " · Verified ✓"}</span>
            </div>
            <p className="mt-2 break-words text-sm">Owner: <b>{b.owner?.full_name || "No name given"}</b> · {b.owner?.member_code ?? b.owner_id} · {b.email ?? "no email"} {b.owner?.email_verified_at ? <span className="text-ok">(email confirmed)</span> : <span className="font-semibold text-warn">(email not confirmed)</span>} · <span className={b.owner?.status === "active" ? "text-ok" : "font-bold text-flame-strong"}>{b.owner?.status ?? "unknown"}</span></p>
            {b.description && <p className="mt-2 line-clamp-3 break-words rounded-lg bg-bg-soft p-2 text-sm text-muted">{String(b.description).slice(0, 320)}</p>}

            {!b.published && (
              <div className={`mt-3 rounded-lg border p-3 ${status === "high" ? "border-flame bg-flame-soft" : "border-warn bg-warn-soft"}`}>
                <p className="text-sm font-bold">{status === "high" ? "Why it is kept off the directory" : "Why it is waiting"}</p>
                {holds.length ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{holds.map((c) => <li key={c}>{reasonLabel(c)}</li>)}</ul>
                ) : (
                  <p className="mt-1 text-sm">{checked ? "No warning signs found. You can approve it." : "Not checked yet. Press “Check waiting listings now” at the top, or approve it yourself."}</p>
                )}
                {b.lifecycle_status && ["rejected", "suspended"].includes(b.lifecycle_status) && <p className="mt-1 text-sm">An admin {b.lifecycle_status} this listing.</p>}
              </div>
            )}
            {notes.length > 0 && <p className="mt-2 text-xs text-muted">Notes: {notes.map(reasonLabel).join(" ")}</p>}

            {waitingLabel(b) && (
              <div className="mt-3 rounded-lg border border-ok bg-ok-soft p-3">
                <p className="text-sm font-bold">{waitingLabel(b)}</p>
                <p className="mt-1 text-sm text-muted">Approve and publish puts this business on the public business directory (flameph.org and pages.flameph.org/directory) within about a minute.</p>
                {b.owner?.status === "active" ? (
                  <form action={moderateBusiness} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="business_id" value={b.id} />
                    <input type="hidden" name="return_to" value={here} />
                    <SubmitButton name="moderation_action" value="approve_legitimate" className="btn btn-primary" pendingText="Publishing…">Approve and publish</SubmitButton>
                    <SubmitButton name="moderation_action" value="request_correction" className="btn btn-outline" pendingText="Sending…">Ask owner to correct</SubmitButton>
                    <SubmitButton name="moderation_action" value="reject" className="btn btn-ghost" pendingText="Saving…">Reject</SubmitButton>
                  </form>
                ) : <p className="mt-2 text-sm font-semibold text-flame-strong">The owner&apos;s account is not active, so this listing can&apos;t be published.</p>}
              </div>
            )}
            {b.published && (
              <form action={moderateBusiness} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="business_id" value={b.id} />
                <input type="hidden" name="return_to" value={here} />
                <Link href={`/directory/${b.slug}`} className="btn btn-outline btn-sm">View public page</Link>
                <SubmitButton name="moderation_action" value="hide" className="btn btn-outline btn-sm" pendingText="Hiding…">Hide listing</SubmitButton>
              </form>
            )}

            {b.reports.length > 0 && <details className="mt-3 rounded-lg border border-flame bg-flame-soft p-3"><summary className="cursor-pointer font-bold text-flame-strong">⚑ {b.reports.length} member report{b.reports.length === 1 ? "" : "s"}</summary><ul className="mt-2 space-y-2 text-sm">{b.reports.map((report: { id: string; data: Record<string, string>; status: string; created_at: string }) => <li key={report.id} className="rounded bg-card p-2"><b>{report.data.reason?.replace(/_/g, " ")}</b> · {when(report.created_at)}<p className="whitespace-pre-line">{report.data.details}</p><span className="text-xs uppercase text-muted">{report.status}</span></li>)}</ul></details>}

            <details className="mt-3 rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-bold">More actions: documents, safety, history</summary>
              {b.assessment && <div className="mt-3 rounded-lg border border-line p-3"><p className="text-sm font-bold">Older listing check: {b.assessment.classification.replace(/_/g, " ")} · {b.assessment.review_state}</p><p className="mt-1 text-sm text-muted">Signals: {(b.assessment.reason_codes as string[]).map(reasonLabel).join(" ") || "none"} Originally {b.assessment.was_published ? "published" : "private"}.</p><form action={reviewLegacyBusiness} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"><input type="hidden" name="business_id" value={b.id} /><input type="hidden" name="return_to" value={here} /><input name="note" className="input" placeholder="Review note" aria-label="Review note" /><button name="legacy_decision" value="restore_public" className="btn btn-outline">Restore public</button><button name="legacy_decision" value="clear_review" className="btn btn-outline">Clear review</button><button name="legacy_decision" value="confirm_quarantine" className="btn btn-flame">Confirm quarantine</button></form></div>}
              {(vetByOwner.get(b.owner_id) ?? []).length > 0 && <div className="mt-3 rounded-lg border border-line p-3"><p className="text-sm font-bold">Vetting documents (encrypted; each view is logged; you can&apos;t open your own)</p><ul className="mt-1 space-y-1 text-sm">{(vetByOwner.get(b.owner_id) ?? []).map((d) => <li key={d.id}><a className="text-mph underline" href={`/api/vetting/doc/${d.id}`} target="_blank" rel="noopener noreferrer">{DOC_TYPES[d.doc_type as DocType]?.label ?? d.doc_type}: {d.file_name}</a> <span className="text-muted">· {new Date(d.uploaded_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</span></li>)}</ul></div>}
              {b.docs.length > 0 && <ul className="mt-2 space-y-1">{b.docs.map((d: { p: string; url?: string }) => <li key={d.p}><a className="text-mph underline" href={d.url ?? "#"} target="_blank" rel="noopener">{d.p.split("/").pop()}</a></li>)}</ul>}
              <p className="mt-3 text-sm font-bold">Verified badge (optional, from documents) · documents {b.verification_status}</p>
              <form action={verifyBusiness} className="mt-1 flex flex-wrap items-end gap-2">
                <input type="hidden" name="business_id" value={b.id} />
                <input type="hidden" name="return_to" value={here} />
                <input name="note" placeholder="Note to record (e.g. DTI cert no. checked)" className="input min-w-0 flex-1" aria-label="Verification note" defaultValue={b.verification_note ?? ""} />
                <button name="decision" value="approve" className="btn btn-primary">Approve documents (Verified badge)</button>
                <button name="decision" value="reject" className="btn btn-outline">Reject documents</button>
                {b.published && <button name="decision" value="unpublish" className="btn btn-ghost">Unpublish</button>}
              </form>
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-sm font-bold uppercase text-muted">Safety and moderation</p>
                <form action={moderateBusiness} className="flex flex-wrap gap-2">
                  <input type="hidden" name="business_id" value={b.id} />
                  <input type="hidden" name="return_to" value={here} />
                  {b.published ? <button name="moderation_action" value="hide" className="btn btn-outline">Hide listing</button> : b.owner?.status === "active" && <button name="moderation_action" value="restore" className="btn btn-outline">Restore listing</button>}
                  <button name="moderation_action" value="approve_legitimate" className="btn btn-outline">Approve legitimate</button>
                  <button name="moderation_action" value="request_correction" className="btn btn-outline">Request correction</button>
                  <button name="moderation_action" value="keep_quarantined" className="btn btn-outline">Keep quarantined</button>
                  <button name="moderation_action" value="reject" className="btn btn-outline">Reject</button>
                  <button name="moderation_action" value="suspend" className="btn btn-outline">Suspend listing</button>
                  {b.owner?.status !== "suspended" && <button name="moderation_action" value="ban_owner" className="btn btn-flame">Ban owner + hide all listings</button>}
                </form>
                {isSuper && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-flame-strong">Permanently delete this business…</summary><form action={moderateBusiness} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="business_id" value={b.id} /><input type="hidden" name="return_to" value={here} /><input type="hidden" name="moderation_action" value="delete_business" /><label className="text-sm">Type DELETE to confirm<input name="confirmation" className="input mt-1 w-40" autoComplete="off" /></label><button className="btn btn-flame">Delete permanently</button></form></details>}
              </div>
              {b.moderationHistory.length > 0 && <div className="mt-3"><p className="text-sm font-bold">Automatic check history ({b.moderationHistory.length})</p><ul className="mt-1 space-y-2 text-sm">{b.moderationHistory.slice(0, 10).map((event: { id: number; risk_level: string; reason_categories: string[]; suspicious_fields: string[]; assessment_version: string; created_at: string }) => <li key={event.id}><b>{event.risk_level.replace(/_/g, " ")}</b> · {when(event.created_at)}<br/><span className="text-muted">{event.reason_categories.map(reasonLabel).join(" ") || "No warning signs"}</span></li>)}</ul></div>}
            </details>
          </article>
        );
      })}

      <Pager label="Pages (bottom)" />
      {withLinks.length > 3 && <p className="text-right"><a className="text-sm text-mph underline" href="#top">Back to top ↑</a></p>}

      {totals.total > 0 && <details className="card p-4"><summary className="cursor-pointer font-bold">Legacy listing safety review (older listings, 30 Oct 2026)</summary><p className="mt-1 text-sm text-muted">No records were deleted. Every original publication state remains recorded for rollback and manual review. These are never published automatically.</p><dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div><dt>Total</dt><dd className="font-bold">{totals.total}</dd></div><div><dt>Presumed legitimate</dt><dd className="font-bold">{totals.legitimate}</dd></div><div><dt>Incomplete</dt><dd className="font-bold">{totals.incomplete}</dd></div><div><dt>High suspicion</dt><dd className="font-bold">{totals.suspicious}</dd></div><div><dt>Uncertain</dt><dd className="font-bold">{totals.uncertain}</dd></div><div><dt>Duplicates</dt><dd className="font-bold">{totals.duplicates}</dd></div><div><dt>Manual review</dt><dd className="font-bold">{totals.manual}</dd></div></dl></details>}
      <p className="rounded-lg bg-primary-soft p-3 text-sm text-primary"><b>Moderation:</b> Hide is reversible. Ban suspends the member and hides all their listings. Permanent delete is available only to super admins.</p>
    </div>
  );
}
