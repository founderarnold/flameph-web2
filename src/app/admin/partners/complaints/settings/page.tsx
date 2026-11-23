import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import { adminFlash, day, latePenalty, SEVERITY, SEVERITY_KEYS, when, type Severity } from "@/lib/partner-cases";
import { decideTerms, proposeTerms, saveTargets } from "../actions";

export const metadata = { title: "Complaint targets and penalty terms", robots: { index: false } };

type Target = { severity: Severity; first_response_hours: number; resolve_days: number; alert_now: boolean; updated_at: string };
type Terms = { id: string; scope: "default" | "agreement"; partner_name: string | null; contract_ref: string | null; signed_on: string | null; late_rate_pct_per_day: number; late_cap_pct: number; note: string | null; status: string; created_by: string | null; approved_at: string | null; created_at: string };

/** Response targets per severity, and the late-delivery penalty terms (default and per signed agreement). */
export default async function CaseSettings({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; why?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  const [{ data: t, error }, { data: terms }, { data: partners }] = await Promise.all([
    ctx.db.from("complaint_targets").select("severity, first_response_hours, resolve_days, alert_now, updated_at"),
    ctx.db.from("partner_penalty_terms").select("id, scope, partner_name, contract_ref, signed_on, late_rate_pct_per_day, late_cap_pct, note, status, created_by, approved_at, created_at").order("created_at", { ascending: false }).limit(200),
    ctx.db.from("partner_profiles").select("user_id, legal_name").order("legal_name").limit(1000),
  ]);
  const targets = new Map(((t ?? []) as Target[]).map((r) => [r.severity, r]));
  const flash = adminFlash(sp);
  const all = (terms ?? []) as Terms[];

  return (
    <div className="space-y-4">
      <PartnerTabs current="complaints" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/complaints" className="underline">Partner complaints</Link> › Targets and penalty terms</nav>
      <h1 className="text-2xl font-extrabold text-primary">Response targets and penalty terms</h1>
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}
      {error && <Notice tone="warn">These open after the database update (0035).</Notice>}

      <form action={saveTargets} className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">Response targets</h2>
        <p className="text-sm text-muted">Counted from when a complaint is sent. Members see these times. &quot;Alert at once&quot; emails the team the moment a complaint of that severity comes in; past-due cases are emailed every hour (once a day per case).</p>
        <div className="space-y-3">
          {SEVERITY_KEYS.map((k) => {
            const r = targets.get(k);
            return (
              <fieldset key={k} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
                <legend className="px-1 font-bold">{SEVERITY[k].label}</legend>
                <p className="text-sm text-muted">{SEVERITY[k].help}</p>
                <div className="field"><label htmlFor={`h_${k}`} className="label text-sm">First reply (hours)</label><input id={`h_${k}`} name={`h_${k}`} inputMode="numeric" defaultValue={r?.first_response_hours ?? ""} className="input" /></div>
                <div className="field"><label htmlFor={`d_${k}`} className="label text-sm">Resolve (days)</label><input id={`d_${k}`} name={`d_${k}`} inputMode="numeric" defaultValue={r?.resolve_days ?? ""} className="input" /></div>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={`a_${k}`} value="yes" defaultChecked={r?.alert_now} className="check" />Alert at once</label>
              </fieldset>
            );
          })}
        </div>
        <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Save targets</SubmitButton>
      </form>

      <section id="terms" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="terms-h">
        <h2 id="terms-h" className="text-lg font-bold">Late-delivery penalty terms</h2>
        <PartnerMoneyNotice compact />
        <p className="text-sm text-muted">Penalty = net value of the delayed items × rate per day × days late, never more than the cap. Example at 0.5% a day, cap 5%: ₱100,000 four days late = {`₱${latePenalty(100000, 0.5, 4, 5).toLocaleString("en-PH")}`}; thirty days late = {`₱${latePenalty(100000, 0.5, 30, 5).toLocaleString("en-PH")}`} (the cap). A signed agreement can set its own terms. New terms need a second national team member. Lawyer review advised before real use.</p>
        <ul className="space-y-2">
          {all.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-bold">{r.scope === "default" ? "Default" : `${r.partner_name}, agreement ${r.contract_ref} signed ${day(r.signed_on)}`}: {r.late_rate_pct_per_day}% per day, cap {r.late_cap_pct}% · {r.status}</p>
              {r.note && <p className="text-muted">{r.note}</p>}
              <p className="text-xs text-muted">Written {when(r.created_at)}{r.approved_at ? ` · active since ${when(r.approved_at)}` : ""}</p>
              {r.status === "draft" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.created_by !== ctx.user.id ? <form action={decideTerms}><input type="hidden" name="terms_id" value={r.id} /><input type="hidden" name="op" value="activate" />
                    <SubmitButton className="btn btn-primary min-h-11" pendingText="Saving…">Make active (second person)</SubmitButton></form> : <span className="self-center text-muted">Another national team member makes it active.</span>}
                  <form action={decideTerms}><input type="hidden" name="terms_id" value={r.id} /><input type="hidden" name="op" value="cancel" />
                    <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">Cancel</SubmitButton></form>
                </div>
              )}
              {r.status === "active" && r.scope === "agreement" && (
                <form action={decideTerms} className="mt-2"><input type="hidden" name="terms_id" value={r.id} /><input type="hidden" name="op" value="retire" />
                  <SubmitButton className="btn btn-outline min-h-11" pendingText="Saving…">End this agreement&apos;s terms</SubmitButton></form>
              )}
            </li>
          ))}
        </ul>
        <form action={proposeTerms} className="space-y-3 rounded-xl border-2 border-primary p-3">
          <h3 className="font-bold">Write new terms</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field"><label htmlFor="scope" className="label">For</label><select id="scope" name="scope" className="input"><option value="default">Everyone (new default)</option><option value="agreement">One partner&apos;s signed agreement</option></select></div>
            <div className="field"><label htmlFor="rate" className="label">% per day late</label><input id="rate" name="rate" inputMode="decimal" defaultValue="0.5" className="input" /></div>
            <div className="field"><label htmlFor="cap" className="label">Cap (% of the value)</label><input id="cap" name="cap" inputMode="decimal" defaultValue="5" className="input" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field"><label htmlFor="pu" className="label">Partner (agreement only)</label><select id="pu" name="partner_user_id" className="input" defaultValue=""><option value="">—</option>{((partners ?? []) as { user_id: string; legal_name: string }[]).map((p) => <option key={p.user_id} value={p.user_id}>{p.legal_name}</option>)}</select></div>
            <div className="field"><label htmlFor="cr" className="label">Contract number</label><input id="cr" name="contract_ref" maxLength={80} className="input" /></div>
            <div className="field"><label htmlFor="so" className="label">Signed on</label><input id="so" name="signed_on" type="date" className="input" /></div>
          </div>
          <div className="field"><label htmlFor="tn" className="label">Note</label><input id="tn" name="note" maxLength={1000} className="input" /></div>
          <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Saving…">Write terms</SubmitButton>
        </form>
      </section>
    </div>
  );
}
