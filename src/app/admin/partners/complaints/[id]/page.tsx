import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import {
  ACTION_KINDS, ACTION_STATUS, adminFlash, CLOSE_REASONS, COMPLAINT_COLS, COMPLAINT_STATUS, day, EVIDENCE_TYPES, ISSUES, manilaToday, MOVE_LABEL,
  overdue, PENALTY_RULES, PENALTY_STATUS, peso, REMEDIES, REMEDY_HINT, SANCTIONS, SEVERITY, SEVERITY_KEYS, TEAM_MOVES, when,
  type ActionKind, type ActionStatus, type ComplaintRow, type PenaltyStatus,
} from "@/lib/partner-cases";
import {
  addCorrectiveAction, checkCorrectiveAction, decidePenalty, moveCase, proposePenalty, proposeSanction, setCaseDetails, teamCaseNote,
} from "../actions";

export const metadata = { title: "Partner complaint", robots: { index: false } };

type Event = { id: string; actor_id: string | null; side: string; action: string; to_status: string | null; note: string | null; internal: boolean; created_at: string };
type Action = { id: string; kind: ActionKind; description: string; due_on: string; amount: number | null; status: ActionStatus; partner_note: string | null; check_note: string | null };
type Penalty = { id: string; kind: string; affected_value: number; days_late: number | null; rate_pct_per_day: number | null; cap_pct: number | null; amount: number; basis_note: string; status: PenaltyStatus; legal_reviewed: boolean; proposed_by: string | null; partner_response: string | null; partner_responded_at: string | null; created_at: string; decision_note: string | null; settled_ref: string | null };
type Doc = { id: string; user_id: string; doc_type: keyof typeof EVIDENCE_TYPES; file_name: string; uploaded_at: string };
const SIDE: Record<string, string> = { member: "Member", partner: "Partner", team: "National team", system: "System" };

/** One complaint for the national team: move it, set severity and who is in charge, request fixes, propose penalties
 *  and sanctions, read both sides' proof, and keep notes (shared or team-only). */
export default async function ComplaintAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; why?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const { data: row } = await ctx.db.from("partner_complaints").select(`${COMPLAINT_COLS}, assigned_to`).eq("id", id).neq("status", "draft").maybeSingle();
  if (!row) notFound();
  const c = row as unknown as ComplaintRow & { assigned_to: string | null };
  const own = c.complainant_id === ctx.user.id || c.partner_user_id === ctx.user.id;
  const [{ data: ev }, { data: acts }, { data: pens }, { data: docs }, { data: team }, { data: member }, { data: terms }, { data: samples }, { data: sans }] = await Promise.all([
    ctx.db.from("partner_complaint_events").select("id, actor_id, side, action, to_status, note, internal, created_at").eq("complaint_id", id).order("created_at", { ascending: false }).limit(200),
    ctx.db.from("partner_corrective_actions").select("id, kind, description, due_on, amount, status, partner_note, check_note").eq("complaint_id", id).order("created_at"),
    ctx.db.from("partner_penalties").select("id, kind, affected_value, days_late, rate_pct_per_day, cap_pct, amount, basis_note, status, legal_reviewed, proposed_by, partner_response, partner_responded_at, created_at, decision_note, settled_ref").eq("complaint_id", id).order("created_at"),
    ctx.db.from("vetting_documents").select("id, user_id, doc_type, file_name, uploaded_at").eq("complaint_id", id).is("deleted_at", null).order("uploaded_at"),
    ctx.db.from("roles").select("user_id, role").in("role", ["super_admin", "admin", "national_reviewer"]),
    c.complainant_id ? ctx.db.from("profiles").select("full_name, member_code").eq("id", c.complainant_id).maybeSingle() : Promise.resolve({ data: null }),
    ctx.db.from("partner_penalty_terms").select("scope, late_rate_pct_per_day, late_cap_pct, contract_ref").eq("status", "active").or(`scope.eq.default${c.partner_user_id ? `,partner_user_id.eq.${c.partner_user_id}` : ""}`),
    c.partner_user_id ? ctx.db.from("partner_sample_tests").select("id, ref_no, product_name, total, safety_concern, status").eq("partner_user_id", c.partner_user_id).neq("status", "draft").order("submitted_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    c.partner_user_id ? ctx.db.from("partner_sanctions").select("id, level, status, created_at").eq("partner_user_id", c.partner_user_id).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
  ]);
  const events = (ev ?? []) as Event[];
  const actions = (acts ?? []) as Action[];
  const penalties = (pens ?? []) as Penalty[];
  const files = (docs ?? []) as Doc[];
  const teamIds = [...new Set(((team ?? []) as { user_id: string }[]).map((r) => r.user_id))];
  const { data: names } = teamIds.length ? await ctx.db.from("profiles").select("id, full_name").in("id", teamIds) : { data: [] };
  const nameOf = new Map(((names ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "Team member"]));
  const activeTerms = ((terms ?? []) as { scope: string; late_rate_pct_per_day: number; late_cap_pct: number; contract_ref: string | null }[]).sort((a) => (a.scope === "agreement" ? -1 : 1))[0];
  const moves = TEAM_MOVES[c.status] ?? [];
  const founder = ctx.roles.includes("super_admin");
  const late = overdue(c);
  const flash = adminFlash(sp);
  const working = ["investigating", "corrective_action", "appealed"].includes(c.status);

  return (
    <div className="space-y-4">
      <PartnerTabs current="complaints" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/complaints" className="underline">Partner complaints</Link> › {c.ref_no}</nav>
      <header>
        <h1 className="break-words text-2xl font-extrabold text-primary">{c.ref_no}: {c.partner_name}</h1>
        <p className="text-sm"><strong>{COMPLAINT_STATUS[c.status].label}</strong> · severity <strong>{SEVERITY[c.severity].label}</strong> · sent {when(c.submitted_at)}</p>
        {late && <p className="text-sm font-bold text-danger">{late === "first_response" ? `First reply was due ${when(c.first_response_due_at)}` : `Resolution was due ${when(c.resolve_due_at)}`}</p>}
        {!late && c.status !== "closed" && <p className="text-sm text-muted">First reply by {when(c.first_response_due_at)}{c.first_responded_at ? " (done)" : ""} · resolve by {when(c.resolve_due_at)}</p>}
      </header>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {own && <Notice tone="danger">This complaint is about you or your business. Another national team member must handle it.</Notice>}

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card space-y-2 p-4" aria-labelledby="sum-h">
          <h2 id="sum-h" className="text-lg font-bold">The complaint</h2>
          <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">Member</dt><dd className="break-words">{member ? `${member.full_name ?? "Member"}${member.member_code ? ` (${member.member_code})` : ""}` : "Account removed"}</dd>
            <dt className="font-semibold">Order reference</dt><dd className="break-words">{c.order_reference}{c.order_date ? ` · ${day(c.order_date)}` : ""}</dd>
            {c.product_or_service && <><dt className="font-semibold">Product or service</dt><dd className="break-words">{c.product_or_service}</dd></>}
            <dt className="font-semibold">Problem</dt><dd>{c.issue ? ISSUES[c.issue].label : "—"}</dd>
            <dt className="font-semibold">Asks for</dt><dd>{c.desired_remedy ? REMEDIES[c.desired_remedy] : "—"}{c.remedy_note ? `: ${c.remedy_note}` : ""}</dd>
            <dt className="font-semibold">Value typed</dt><dd>{peso(c.affected_value)} <span className="text-muted">(not checked)</span></dd>
            <dt className="font-semibold">Consent</dt><dd>{when(c.consent_at)}</dd>
          </dl>
          {c.affected_value !== null && <PartnerMoneyNotice compact />}
          <p className="whitespace-pre-line rounded-lg bg-bg-soft p-3 text-[15px]">{c.description}</p>
          <h3 className="pt-2 font-bold">Partner&apos;s answer</h3>
          {c.partner_response ? <p className="whitespace-pre-line text-[15px]">{c.partner_response} <span className="block text-xs text-muted">{when(c.partner_responded_at)}</span></p> : <p className="text-sm text-muted">No answer yet.</p>}
          {c.appeal_reason && <p className="text-sm"><strong>Appeal by the {c.appeal_by} ({when(c.appealed_at)}):</strong> {c.appeal_reason}</p>}
          {c.outcome_note && <p className="text-sm"><strong>Outcome:</strong> {c.outcome_note}</p>}
          {c.close_reason && <p className="text-sm text-muted">Closed: {CLOSE_REASONS[c.close_reason]} ({when(c.closed_at)})</p>}
        </section>

        <div className="space-y-4">
          {!own && moves.length > 0 && (c.status !== "appealed" || founder) && (
            <form id="move" action={moveCase} className="card scroll-mt-24 space-y-3 p-4">
              <input type="hidden" name="id" value={c.id} />
              <h2 className="text-lg font-bold">Next step</h2>
              {c.status === "appealed" && <p className="text-sm text-muted">Appeal: as founder, look into it again or close it with your decision.</p>}
              <fieldset className="space-y-1">
                <legend className="label">Move to</legend>
                {moves.map((m) => (
                  <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3"><input type="radio" name="to" value={m} required />{MOVE_LABEL[m]}</label>
                ))}
              </fieldset>
              {(moves.includes("resolved") || moves.includes("closed")) && (
                <div className="field"><label htmlFor="outcome_note" className="label">Outcome (both sides read it; needed to resolve)</label>
                  <textarea id="outcome_note" name="outcome_note" maxLength={2000} rows={3} className="input" defaultValue={c.outcome_note ?? ""} /></div>
              )}
              {moves.includes("closed") && (
                <div className="field"><label htmlFor="close_reason" className="label">If closing: why</label>
                  <select id="close_reason" name="close_reason" className="input" defaultValue=""><option value="">Choose…</option>
                    {Object.entries(CLOSE_REASONS).filter(([k]) => k !== "withdrawn" && k !== "appeal_decided").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              )}
              <div className="field"><label htmlFor="mv-note" className="label">Note for the history (optional)</label><input id="mv-note" name="note" maxLength={2000} className="input" /></div>
              <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save step</SubmitButton>
            </form>
          )}
          {c.status === "appealed" && !founder && <Notice tone="info">Waiting for the founder to decide the appeal.</Notice>}

          {!own && c.status !== "closed" && (
            <form id="details" action={setCaseDetails} className="card scroll-mt-24 space-y-3 p-4">
              <input type="hidden" name="id" value={c.id} />
              <h2 className="text-lg font-bold">Severity and person in charge</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field"><label htmlFor="severity" className="label">Severity</label>
                  <select id="severity" name="severity" className="input" defaultValue={c.severity}>{SEVERITY_KEYS.map((k) => <option key={k} value={k}>{SEVERITY[k].label}: {SEVERITY[k].help}</option>)}</select></div>
                <div className="field"><label htmlFor="assigned_to" className="label">In charge</label>
                  <select id="assigned_to" name="assigned_to" className="input" defaultValue={c.assigned_to ?? ""}><option value="">Nobody yet</option>
                    {teamIds.filter((u) => u !== c.partner_user_id && u !== c.complainant_id).map((u) => <option key={u} value={u}>{nameOf.get(u) ?? "Team member"}</option>)}</select></div>
              </div>
              <p className="field-help">Changing severity moves the due dates (counted from when it was sent).</p>
              <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <section id="actions" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="act-h">
        <h2 id="act-h" className="text-lg font-bold">Fixes (corrective actions)</h2>
        <PartnerMoneyNotice compact />
        {c.issue && <p className="text-sm text-muted">Usual fixes for {ISSUES[c.issue].label.toLowerCase()}: {REMEDY_HINT[c.issue].map((k) => ACTION_KINDS[k]).join("; ")}.</p>}
        {actions.length === 0 ? <p className="text-sm">None yet.</p> : (
          <ul className="space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold">{ACTION_KINDS[a.kind]}{a.amount !== null ? `: ${peso(a.amount)} (record only)` : ""} · due {day(a.due_on)} · {ACTION_STATUS[a.status]}</p>
                <p>{a.description}</p>
                {a.partner_note && <p><strong>Partner:</strong> {a.partner_note}</p>}
                {a.check_note && <p><strong>Team:</strong> {a.check_note}</p>}
                {!own && ["open", "done_by_partner"].includes(a.status) && c.status !== "closed" && (
                  <form action={checkCorrectiveAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input type="hidden" name="id" value={c.id} /><input type="hidden" name="action_id" value={a.id} />
                    <div className="field flex-1"><label htmlFor={`cn-${a.id}`} className="label text-sm">Note</label><input id={`cn-${a.id}`} name="check_note" maxLength={1000} className="input" /></div>
                    <select name="to" className="input sm:w-56" aria-label="Result" defaultValue={a.status === "done_by_partner" ? "verified" : "not_done"}>
                      {a.status === "done_by_partner" && <><option value="verified">Checked: done</option><option value="open">Not enough: send back</option></>}
                      {a.status === "open" && <option value="not_done">Not done by the due date</option>}
                      <option value="cancelled">Cancel this fix</option>
                    </select>
                    <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Save</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {!own && working && (
          <form action={addCorrectiveAction} className="space-y-3 rounded-xl border-2 border-primary p-3">
            <input type="hidden" name="id" value={c.id} />
            <h3 className="font-bold">Request a fix from the partner</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="field"><label htmlFor="kind" className="label">Kind</label>
                <select id="kind" name="kind" className="input" required defaultValue={c.issue ? REMEDY_HINT[c.issue][0] : ""}>{Object.entries(ACTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label htmlFor="due_on" className="label">Due date</label><input id="due_on" name="due_on" type="date" min={manilaToday()} required className="input" /></div>
              <div className="field"><label htmlFor="amount" className="label">Amount (credit or refund only)</label><input id="amount" name="amount" inputMode="decimal" maxLength={16} className="input" placeholder="e.g. 450" /></div>
            </div>
            <div className="field"><label htmlFor="description" className="label">What exactly</label><input id="description" name="description" maxLength={1000} required className="input" placeholder="e.g. Deliver the 2 missing packs to the member" /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Request fix</SubmitButton>
          </form>
        )}
      </section>

      <section id="penalty" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="pen-h">
        <h2 id="pen-h" className="text-lg font-bold">Penalties (proposed figures only)</h2>
        <PartnerMoneyNotice compact />
        <ul className="list-disc pl-5 text-sm text-muted">{PENALTY_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
        {penalties.map((p) => {
          const mine = p.proposed_by === ctx.user.id;
          const waitDays = Math.max(0, 7 - Math.floor((Date.now() - Date.parse(p.created_at)) / 86400_000));
          return (
            <article key={p.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-bold">{peso(p.amount)} · {PENALTY_STATUS[p.status]}{p.legal_reviewed ? " · legal review done" : ""}</p>
              <p>{p.kind === "late_delivery" ? `Late: ${peso(p.affected_value)} × ${p.rate_pct_per_day}%/day × ${p.days_late} day(s), cap ${p.cap_pct}%` : `Other, on ${peso(p.affected_value)}`}</p>
              <p className="whitespace-pre-line text-muted">{p.basis_note}</p>
              <p>{p.partner_response ? <><strong>Partner&apos;s answer:</strong> {p.partner_response}</> : p.status === "proposed" ? `Waiting for the partner's answer${waitDays ? ` (up to ${waitDays} more day${waitDays > 1 ? "s" : ""})` : " (7 days have passed)"}` : null}</p>
              {p.decision_note && <p><strong>Decision:</strong> {p.decision_note}</p>}
              {!own && p.status === "proposed" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {!p.legal_reviewed && <form action={decidePenalty}><input type="hidden" name="penalty_id" value={p.id} /><input type="hidden" name="op" value="legal" /><input type="hidden" name="from" value="case" />
                    <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Legal review done</SubmitButton></form>}
                  {p.legal_reviewed && !mine && <form action={decidePenalty}><input type="hidden" name="penalty_id" value={p.id} /><input type="hidden" name="op" value="approve" /><input type="hidden" name="from" value="case" />
                    <SubmitButton className="btn btn-primary min-h-11" pendingText="Approving…">Approve (second person)</SubmitButton></form>}
                  {mine && p.legal_reviewed && <p className="self-center text-muted">Another national team member approves.</p>}
                </div>
              )}
              {!own && ["proposed", "approved"].includes(p.status) && (
                <form action={decidePenalty} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="penalty_id" value={p.id} /><input type="hidden" name="from" value="case" />
                  <div className="field flex-1"><label htmlFor={`dn-${p.id}`} className="label text-sm">Reason</label><input id={`dn-${p.id}`} name="decision_note" maxLength={1000} className="input" /></div>
                  <select name="op" className="input sm:w-40" aria-label="Decision"><option value="waive">Waive</option>{p.status === "proposed" && <option value="cancel">Cancel</option>}</select>
                  <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Save</SubmitButton>
                </form>
              )}
            </article>
          );
        })}
        {!own && working && (
          <form action={proposePenalty} className="space-y-3 rounded-xl border-2 border-warn p-3">
            <input type="hidden" name="id" value={c.id} />
            <h3 className="font-bold">Propose a penalty</h3>
            <p className="text-sm text-muted">Terms in force: {activeTerms ? `${activeTerms.late_rate_pct_per_day}% per day, cap ${activeTerms.late_cap_pct}%${activeTerms.contract_ref ? ` (agreement ${activeTerms.contract_ref})` : " (default)"}` : "none"}. The database works out the late-delivery figure.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="field"><label htmlFor="pk" className="label">Kind</label><select id="pk" name="kind" className="input"><option value="late_delivery">Late delivery</option><option value="other">Other (per agreement)</option></select></div>
              <div className="field"><label htmlFor="av" className="label">Affected net value (₱)</label><input id="av" name="affected_value" inputMode="decimal" maxLength={16} required className="input" defaultValue={c.affected_value ?? ""} /></div>
              <div className="field"><label htmlFor="dl" className="label">Days late (late delivery)</label><input id="dl" name="days_late" inputMode="numeric" maxLength={4} className="input" /></div>
            </div>
            <div className="field"><label htmlFor="pa" className="label">Amount (other kind only, ₱)</label><input id="pa" name="amount" inputMode="decimal" maxLength={16} className="input" /></div>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="attributable" value="yes" className="check" />The delay or problem was the partner&apos;s fault (not the courier the member chose, the weather, or the member)</label>
            <div className="field"><label htmlFor="bn" className="label">Basis (agreement clause and what happened)</label><textarea id="bn" name="basis_note" maxLength={2000} rows={2} required className="input" /></div>
            <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Propose penalty</SubmitButton>
          </form>
        )}
      </section>

      <section id="sanction" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="san-h">
        <h2 id="san-h" className="text-lg font-bold">Sanctions for this partner</h2>
        {((sans ?? []) as { id: string; level: keyof typeof SANCTIONS; status: string; created_at: string }[]).length > 0 && (
          <ul className="list-disc pl-5 text-sm">{((sans ?? []) as { id: string; level: keyof typeof SANCTIONS; status: string; created_at: string }[]).map((s) => <li key={s.id}>{SANCTIONS[s.level].label}: {s.status} ({day(s.created_at)})</li>)}</ul>
        )}
        <p className="text-sm"><Link href="/admin/partners/sanctions" className="underline">Open Sanctions</Link> to make one active, lift or cancel it.</p>
        {!own && c.partner_user_id && c.status !== "closed" && (
          <form action={proposeSanction} className="space-y-3 rounded-xl border border-line p-3">
            <input type="hidden" name="partner_user_id" value={c.partner_user_id} /><input type="hidden" name="complaint_id" value={c.id} /><input type="hidden" name="from" value="case" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field"><label htmlFor="lv" className="label">Level</label><select id="lv" name="level" className="input">{Object.entries(SANCTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div className="field"><label htmlFor="eo" className="label">Ends on (probation and hold)</label><input id="eo" name="ends_on" type="date" className="input" /></div>
            </div>
            <div className="field"><label htmlFor="rs" className="label">Reason (the partner reads it)</label><textarea id="rs" name="reason" maxLength={2000} rows={2} required className="input" /></div>
            {c.severity === "critical" && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="urgent" value="yes" className="check" />Urgent safety hold (can start before the partner answers)</label>}
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Propose sanction</SubmitButton>
          </form>
        )}
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="ev-h">
        <h2 id="ev-h" className="text-lg font-bold">Proof from both sides</h2>
        {files.length === 0 ? <p className="text-sm">No files.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {files.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 p-3">
                <span className="min-w-0 break-words">{d.file_name} <span className="text-muted">· {EVIDENCE_TYPES[d.doc_type]?.label ?? d.doc_type} · {d.user_id === c.complainant_id ? "member" : d.user_id === c.partner_user_id ? "partner" : "team"} · {when(d.uploaded_at)}</span></span>
                {d.user_id !== ctx.user.id && <a href={`/api/vetting/doc/${d.id}`} target="_blank" rel="noopener" className="btn btn-outline min-h-11 px-3">Open</a>}
              </li>
            ))}
          </ul>
        )}
        {(samples ?? []).length > 0 && (
          <p className="text-sm">Recent sample tests of this partner: {((samples ?? []) as { id: string; ref_no: string; product_name: string; total: number | null; safety_concern: boolean }[]).map((t, i) => (
            <span key={t.id}>{i > 0 && " · "}<Link href={`/admin/partners/samples/${t.id}`} className="underline">{t.ref_no} {t.product_name} {t.total ?? "—"}/25{t.safety_concern ? " (safety)" : ""}</Link></span>
          ))}</p>
        )}
      </section>

      <section id="history" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History and notes</h2>
        {!own && (
          <form action={teamCaseNote} className="space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <label htmlFor="tn" className="label">Note</label>
            <textarea id="tn" name="note" maxLength={3000} rows={2} className="input" />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="internal" value="yes" className="check" defaultChecked />Team only (the member and partner do not see it)</label>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Adding…">Add note</SubmitButton>
          </form>
        )}
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className={`rounded-lg p-3 text-sm ${e.internal ? "border border-dashed border-warn bg-warn-soft/40" : "bg-bg-soft"}`}>
              <p className="font-semibold">{e.action.replace("_", " ")}{e.to_status ? ` → ${COMPLAINT_STATUS[e.to_status as keyof typeof COMPLAINT_STATUS]?.label ?? e.to_status}` : ""}{e.internal ? " · team only" : ""}</p>
              {e.note && <p className="whitespace-pre-line break-words">{e.note}</p>}
              <p className="text-xs text-muted">{SIDE[e.side] ?? e.side}{e.side === "team" && e.actor_id ? ` (${nameOf.get(e.actor_id) ?? "team member"})` : ""} · {when(e.created_at)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
