import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerMoneyNotice } from "@/components/PartnerMoneyNotice";
import {
  CASE_DONE, CASE_ERRORS, COMPLAINT_STATUS, day, ISSUES, overdue, PENALTY_RULES, PENALTY_STATUS, peso, RESPONSE_DAYS, SANCTION_STATUS, SANCTIONS,
  SEVERITY, when, type ComplaintStatus, type Issue, type PenaltyStatus, type SanctionLevel, type SanctionStatus, type Severity,
} from "@/lib/partner-cases";
import { answerPenaltyOrSanction } from "./actions";

export const metadata = { title: "Complaints about partner orders", robots: { index: false } };

type Row = { id: string; ref_no: string; partner_name: string; complainant_id: string | null; partner_user_id: string | null; issue: Issue | null; status: ComplaintStatus; severity: Severity; order_reference: string | null; submitted_at: string | null; first_response_due_at: string | null; resolve_due_at: string | null; updated_at: string };
type Penalty = { id: string; complaint_id: string; kind: string; affected_value: number; days_late: number | null; rate_pct_per_day: number | null; cap_pct: number | null; amount: number; basis_note: string; status: PenaltyStatus; partner_response: string | null; created_at: string; settled_ref: string | null };
type Sanction = { id: string; level: SanctionLevel; reason: string; ends_on: string | null; status: SanctionStatus; partner_response: string | null; created_at: string; urgent: boolean };
type Target = { severity: Severity; first_response_hours: number; resolve_days: number };
const tone = (s: ComplaintStatus) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", info: "bg-primary-soft text-primary" })[COMPLAINT_STATUS[s].tone];
const hours = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);

function CaseCard({ r, mine }: { r: Row; mine: boolean }) {
  const late = overdue(r);
  return (
    <li className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-muted">{r.ref_no} · {r.issue ? ISSUES[r.issue].label : "Not filled in yet"}</p>
        <p className="break-words text-lg font-extrabold">{mine ? r.partner_name : `Order ${r.order_reference ?? "—"}`}</p>
        <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(r.status)}`}>{COMPLAINT_STATUS[r.status].label}</span>
        {r.status !== "draft" && <span className="ml-2 text-sm text-muted">Severity: {SEVERITY[r.severity].label}</span>}
        <p className="mt-1 text-xs text-muted">{r.submitted_at ? `Sent ${when(r.submitted_at)}` : `Last saved ${when(r.updated_at)}`}{late ? " · past the target time, the team has been reminded" : ""}</p>
      </div>
      <Link href={`/partner-us/complaints/${r.id}`} className="btn btn-primary min-h-11 w-full sm:w-auto">{r.status === "draft" ? "Continue" : "Open"}</Link>
    </li>
  );
}

/** A member's complaints about accredited partners; for a partner, the complaints about its business, and its
 *  proposed penalties and sanctions with a box to answer each. */
export default async function MyComplaints({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/partner-us/complaints");
  const cols = "id, ref_no, partner_name, complainant_id, partner_user_id, issue, status, severity, order_reference, submitted_at, first_response_due_at, resolve_due_at, updated_at";
  const [{ data, error }, { data: prof }, { data: pens }, { data: sans }, { data: targets }] = await Promise.all([
    supabase.from("partner_complaints").select(cols).order("created_at", { ascending: false }).limit(200),
    supabase.from("partner_profiles").select("status, legal_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("partner_penalties").select("id, complaint_id, kind, affected_value, days_late, rate_pct_per_day, cap_pct, amount, basis_note, status, partner_response, created_at, settled_ref").eq("partner_user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("partner_sanctions").select("id, level, reason, ends_on, status, partner_response, created_at, urgent").eq("partner_user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("complaint_targets").select("severity, first_response_hours, resolve_days").order("resolve_days"),
  ]);
  const rows = (data ?? []) as Row[];
  const mine = rows.filter((r) => r.complainant_id === user.id);
  const aboutMe = rows.filter((r) => r.partner_user_id === user.id && r.complainant_id !== user.id);
  const penalties = (pens ?? []) as Penalty[];
  const sanctions = (sans ?? []) as Sanction[];
  const err = sp.error ? CASE_ERRORS[sp.error] ?? CASE_ERRORS.failed : error ? CASE_ERRORS.unavailable : null;
  const done = sp.done ? CASE_DONE[sp.done] : null;

  return (
    <div className="container-x max-w-3xl space-y-5 py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/partner-us" className="underline">Become an Accredited Partner</Link> › Complaints</nav>
      <header>
        <p className="font-display font-bold text-flame-strong" lang="fil">Reklamo tungkol sa order o serbisyo ng partner</p>
        <h1 className="text-3xl font-extrabold text-primary">Complaints about partner orders</h1>
        <p className="mt-1 text-muted">Bought from an accredited FLAME PH partner and something went wrong (late, missing, damaged, defective, poor service or a safety problem)? Tell us. The national team looks into it and the partner gets a fair chance to answer.</p>
        <p className="mt-1 text-sm text-muted" lang="fil">May problema sa order mula sa accredited partner? Ipaalam sa amin.</p>
      </header>
      {done && <div role="status"><Notice tone="ok">{done}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      {!error && (
        <section className="card space-y-3 border-2 border-flame p-4 sm:p-5" aria-labelledby="new-h">
          <h2 id="new-h" className="text-lg font-bold">File a complaint</h2>
          <p className="text-[15px] leading-6 text-muted">Have your order or service reference number ready (from MarketplacePH Online Store or the partner&apos;s receipt), and photos if you can. It saves as you go.</p>
          <Link href="/partner-us/complaints/new" className="btn btn-flame min-h-11 w-full sm:w-auto">File a complaint</Link>
        </section>
      )}

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="text-xl font-extrabold">My complaints</h2>
        {mine.length === 0 ? <Notice tone="info">You have not filed any complaint.</Notice> : <ul className="space-y-3">{mine.map((r) => <CaseCard key={r.id} r={r} mine />)}</ul>}
      </section>

      {(prof || aboutMe.length > 0) && (
        <section aria-labelledby="about-h" className="space-y-3">
          <h2 id="about-h" className="text-xl font-extrabold">Complaints about my business</h2>
          <p className="text-sm text-muted">Answer each one with your side and any proof. You can also mark a requested fix as done. <span lang="fil">Sagutin ang bawat reklamo.</span></p>
          {aboutMe.length === 0 ? <Notice tone="ok">No complaints about your business.</Notice> : <ul className="space-y-3">{aboutMe.map((r) => <CaseCard key={r.id} r={r} mine={false} />)}</ul>}
        </section>
      )}

      {(penalties.length > 0 || sanctions.length > 0) && (
        <section id="standing" aria-labelledby="standing-h" className="scroll-mt-24 space-y-4">
          <h2 id="standing-h" className="text-xl font-extrabold">Penalties and notices for my business</h2>
          {penalties.length > 0 && <PartnerMoneyNotice />}
          {penalties.map((p) => (
            <article key={p.id} className="card space-y-2 p-4">
              <p className="text-xs font-bold uppercase text-muted">Penalty · {PENALTY_STATUS[p.status]}</p>
              <p className="text-lg font-extrabold">{peso(p.amount)}</p>
              <p className="text-sm">{p.kind === "late_delivery" ? `Late delivery: ${peso(p.affected_value)} delayed × ${p.rate_pct_per_day}% per day × ${p.days_late} day(s), capped at ${p.cap_pct}%.` : `Affected value ${peso(p.affected_value)}.`}</p>
              <p className="whitespace-pre-line text-sm text-muted">{p.basis_note}</p>
              <p className="text-sm"><Link href={`/partner-us/complaints/${p.complaint_id}`} className="underline">Open the complaint</Link>{p.settled_ref ? ` · Settled by MarketplacePH Online Store, ref ${p.settled_ref}` : ""}</p>
              {p.partner_response && <p className="rounded-lg bg-bg-soft p-2 text-sm"><strong>Your answer:</strong> {p.partner_response}</p>}
              {p.status === "proposed" && (
                <form action={answerPenaltyOrSanction} className="space-y-2">
                  <input type="hidden" name="kind" value="penalty" /><input type="hidden" name="item_id" value={p.id} />
                  <label htmlFor={`pr-${p.id}`} className="label">{p.partner_response ? "Change your answer" : "Your answer (you have " + RESPONSE_DAYS + " days)"}</label>
                  <textarea id={`pr-${p.id}`} name="partner_response" maxLength={2000} rows={3} className="input" defaultValue={p.partner_response ?? ""} />
                  <p className="field-help" lang="fil">Isulat kung sang-ayon kayo o hindi, at bakit.</p>
                  <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send my answer</SubmitButton>
                </form>
              )}
            </article>
          ))}
          {sanctions.map((s) => (
            <article key={s.id} className={`card space-y-2 p-4 ${s.status === "active" ? "border-2 border-warn" : ""}`}>
              <p className="text-xs font-bold uppercase text-muted">Notice · {SANCTION_STATUS[s.status]}</p>
              <p className="text-lg font-extrabold">{SANCTIONS[s.level].label}{s.ends_on ? ` until ${day(s.ends_on)}` : ""}</p>
              <p className="text-sm text-muted">{SANCTIONS[s.level].help}</p>
              <p className="whitespace-pre-line text-[15px]">{s.reason}</p>
              {s.partner_response && <p className="rounded-lg bg-bg-soft p-2 text-sm"><strong>Your answer:</strong> {s.partner_response}</p>}
              {(s.status === "proposed" || s.status === "active") && (
                <form action={answerPenaltyOrSanction} className="space-y-2">
                  <input type="hidden" name="kind" value="sanction" /><input type="hidden" name="item_id" value={s.id} />
                  <label htmlFor={`sr-${s.id}`} className="label">{s.partner_response ? "Change your answer" : "Your answer"}</label>
                  <textarea id={`sr-${s.id}`} name="partner_response" maxLength={2000} rows={3} className="input" defaultValue={s.partner_response ?? ""} />
                  <SubmitButton className="btn btn-primary min-h-11 w-full sm:w-auto" pendingText="Sending…">Send my answer</SubmitButton>
                </form>
              )}
            </article>
          ))}
        </section>
      )}

      <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="how-h">
        <h2 id="how-h" className="text-lg font-bold">How complaints are handled</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[15px] leading-6 text-muted">
          <li>You send it with the order reference, what happened, what you would like, and photos.</li>
          <li>The national team replies and looks into it. The partner reads it and gives its side.</li>
          <li>If the partner is at fault, the team asks it to fix it: replacement, credit, refund, or doing the service again.</li>
          <li>The case is resolved. Either side may appeal once within 7 days; the founder decides.</li>
        </ol>
        {(targets ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-left text-sm">
              <caption className="pb-1 text-left font-semibold">Our target times</caption>
              <thead><tr className="border-b border-line"><th className="py-1 pr-2">Problem</th><th className="py-1 pr-2">First reply</th><th className="py-1">Resolved within</th></tr></thead>
              <tbody>{((targets ?? []) as Target[]).map((t) => (
                <tr key={t.severity} className="border-b border-line last:border-0"><td className="py-1 pr-2">{SEVERITY[t.severity].label}: {SEVERITY[t.severity].help}</td><td className="py-1 pr-2">{hours(t.first_response_hours)}</td><td className="py-1">{t.resolve_days} days</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {prof && (
          <details className="rounded-xl border border-line px-3 py-1">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">For partners: remedies and penalties</summary>
            <ul className="list-disc space-y-1 pb-3 pl-5 text-sm text-muted">{PENALTY_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          </details>
        )}
        <p className="text-sm text-muted">flameph.org never collects or holds money. Any refund, credit or penalty is settled by MarketplacePH Online Store or the partner.</p>
      </section>
    </div>
  );
}
