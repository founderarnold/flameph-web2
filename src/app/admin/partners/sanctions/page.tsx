import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { adminFlash, day, manilaToday, RESPONSE_DAYS, SANCTION_STATUS, SANCTIONS, when, type SanctionLevel, type SanctionStatus } from "@/lib/partner-cases";
import { decideSanction, proposeSanction } from "../complaints/actions";

export const metadata = { title: "Partner sanctions", robots: { index: false } };

type Row = { id: string; partner_user_id: string | null; partner_name: string; complaint_id: string | null; level: SanctionLevel; reason: string; ends_on: string | null; status: SanctionStatus; urgent: boolean; proposed_by: string | null; partner_response: string | null; partner_responded_at: string | null; created_at: string; approved_at: string | null; lifted_at: string | null; lift_note: string | null };

/** Warnings, probation, holds, downgrades and terminations. One national team member proposes, another makes it
 *  active (the founder for a termination), after the partner's answer or 7 days. A hold or termination suspends the
 *  accreditation. */
export default async function SanctionsAdmin({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; why?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data, error }, { data: partners }] = await Promise.all([
    ctx.db.from("partner_sanctions").select("id, partner_user_id, partner_name, complaint_id, level, reason, ends_on, status, urgent, proposed_by, partner_response, partner_responded_at, created_at, approved_at, lifted_at, lift_note").order("created_at", { ascending: false }).limit(300),
    ctx.db.from("partner_profiles").select("user_id, legal_name, status").order("legal_name").limit(1000),
  ]);
  const rows = (data ?? []) as Row[];
  const founder = ctx.roles.includes("super_admin");
  const flash = adminFlash(sp);

  return (
    <div className="space-y-4">
      <PartnerTabs current="sanctions" />
      <h1 className="text-2xl font-extrabold text-primary">Partner sanctions</h1>
      <p className="text-sm text-muted">The escalation ladder: {Object.values(SANCTIONS).map((s) => s.label).join(" → ")}. The partner is told and may answer; a second national team member makes it active after the answer or {RESPONSE_DAYS} days (an urgent safety hold on a critical complaint can start at once). Only the founder approves a termination. Chapters never decide sanctions.</p>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {error && <Notice tone="warn">Sanctions open after the database update (0035).</Notice>}

      {rows.length === 0 ? <Notice tone="info">No sanctions.</Notice> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const waitDays = Math.max(0, RESPONSE_DAYS - Math.floor((Date.now() - Date.parse(r.created_at)) / 86400_000));
            const canWait = r.level === "warning" || r.urgent || r.partner_responded_at || waitDays === 0;
            const own = r.partner_user_id === ctx.user.id;
            return (
              <li key={r.id} className={`card space-y-1 p-4 text-sm ${r.status === "active" ? "border-2 border-warn" : ""}`}>
                <p className="text-xs font-bold uppercase text-muted">{SANCTION_STATUS[r.status]}{r.urgent ? " · urgent safety hold" : ""}</p>
                <p className="text-lg font-extrabold">{SANCTIONS[r.level].label}: {r.partner_name}</p>
                <p className="text-muted">{SANCTIONS[r.level].help}{r.ends_on ? ` Ends ${day(r.ends_on)}.` : ""}</p>
                <p className="whitespace-pre-line">{r.reason}</p>
                {r.complaint_id && <Link href={`/admin/partners/complaints/${r.complaint_id}`} className="underline">Open the complaint</Link>}
                <p>{r.partner_response ? <><strong>Partner&apos;s answer:</strong> {r.partner_response}</> : r.status === "proposed" ? `No answer yet${waitDays ? ` (${waitDays} day${waitDays > 1 ? "s" : ""} left)` : " (7 days have passed)"}` : null}</p>
                <p className="text-xs text-muted">Proposed {when(r.created_at)}{r.approved_at ? ` · active ${when(r.approved_at)}` : ""}{r.lifted_at ? ` · ended ${when(r.lifted_at)}: ${r.lift_note}` : ""}</p>
                {!own && r.status === "proposed" && r.proposed_by !== ctx.user.id && canWait && (r.level !== "termination" || founder) && (
                  <form action={decideSanction}><input type="hidden" name="sanction_id" value={r.id} /><input type="hidden" name="op" value="activate" />
                    <SubmitButton className="btn btn-primary min-h-11" pendingText="Saving…">Make active (second person)</SubmitButton></form>
                )}
                {!own && r.status === "proposed" && r.level === "termination" && !founder && <p className="text-muted">Only the founder approves a termination.</p>}
                {!own && (r.status === "proposed" || (r.status === "active" && r.level !== "termination")) && (
                  <form action={decideSanction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input type="hidden" name="sanction_id" value={r.id} /><input type="hidden" name="op" value={r.status === "proposed" ? "cancel" : "lift"} />
                    <div className="field flex-1"><label htmlFor={`ln-${r.id}`} className="label text-sm">Reason</label><input id={`ln-${r.id}`} name="lift_note" maxLength={1000} required className="input" /></div>
                    <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">{r.status === "proposed" ? "Cancel" : "Lift"}</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form action={proposeSanction} className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">Propose a sanction</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="field"><label htmlFor="pu" className="label">Partner</label><select id="pu" name="partner_user_id" required className="input" defaultValue=""><option value="" disabled>Choose…</option>
            {((partners ?? []) as { user_id: string; legal_name: string; status: string }[]).filter((p) => p.user_id !== ctx.user.id).map((p) => <option key={p.user_id} value={p.user_id}>{p.legal_name}{p.status !== "accredited" ? " (suspended)" : ""}</option>)}</select></div>
          <div className="field"><label htmlFor="lv" className="label">Level</label><select id="lv" name="level" className="input">{Object.entries(SANCTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div className="field"><label htmlFor="eo" className="label">Ends on (probation and hold)</label><input id="eo" name="ends_on" type="date" min={manilaToday()} className="input" /></div>
        </div>
        <div className="field"><label htmlFor="rs" className="label">Reason (the partner reads it)</label><textarea id="rs" name="reason" maxLength={2000} rows={3} required className="input" /></div>
        <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Propose</SubmitButton>
      </form>
    </div>
  );
}
