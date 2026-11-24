import Link from "next/link";
import { notFound } from "next/navigation";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CommissionTabs } from "@/components/admin/CommissionTabs";
import { RateInputs, RULE_ERRORS, SplitText } from "@/components/admin/CommissionRate";
import { ROLE_LABELS } from "@/lib/moderation";
import { CATEGORIES, LEVEL_LABEL, manilaDay, peso2, pct, RULE_STATUS, splitCommission, toSplit, type Category, type RuleStatus } from "@/lib/commission";
import { approveRule, endRule, saveRule } from "../../actions";

export const metadata = { title: "Commission rate", robots: { index: false } };

type Rule = {
  id: string; scope: "default" | "agreement"; partner_category: Category; partner_user_id: string | null; partner_name: string | null; appointment_id: string | null; offer_id: string | null;
  contract_ref: string | null; signed_on: string | null; national_pct: number; regional_pct: number; provincial_pct: number; city_pct: number; total_pct: number; effective_from: string;
  effective_to: string | null; basis_note: string | null; internal_note: string | null; status: RuleStatus; created_by: string | null; approved_by: string | null; approved_at: string | null;
  retired_by: string | null; retired_at: string | null; status_reason: string | null; created_at: string;
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : "—");
const tone = (t: string) => ({ ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-primary" })[t] ?? "bg-bg-soft";
const ERR: Record<string, string> = {
  ...RULE_ERRORS, locked: "Only a draft can be changed. Make a new version (default) or a new agreement rate instead.", status: "That can't be done in the current status.",
  second: "You wrote this rate. A second person on the national team must approve it.", coi: "Tick the box to declare that you have no conflict of interest.",
  reason: "Write the reason.", last_day: "Choose a last day inside the rate's dates.",
};
const DONE: Record<string, string> = { created: "Draft saved. A second person on the national team must approve it.", saved: "Saved.", approved: "Approved. It is in use from its first day.", cancelled: "Draft cancelled.", retired: "Retired. It still applies to sales up to its last day.", from_contract: "Draft agreement rate made from the signed contract (its number and signing date come from the contract). A second person on the national team must approve it." };

/** One rate: its four-level split, dates and contract; a second national-team member approves it here. */
export default async function RulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string; m?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer", "finance"]);
  const national = ctx.roles.some((r) => ["super_admin", "admin", "national_reviewer"].includes(r));
  const [{ data: row }, { data: hist }, { count: used }] = await Promise.all([
    ctx.db.from("commission_rules").select("*").eq("id", id).maybeSingle(),
    ctx.db.from("commission_history").select("id, actor_id, action, note, created_at").eq("rule_id", id).order("created_at", { ascending: false }).limit(50),
    ctx.db.from("commission_entries").select("id", { count: "exact", head: true }).eq("rule_id", id).eq("status", "approved"),
  ]);
  if (!row) notFound();
  const r = row as unknown as Rule;
  const people = [...new Set([r.created_by, r.approved_by, r.retired_by, ...(hist ?? []).map((h) => h.actor_id)].filter(Boolean) as string[])];
  const [{ data: names }, { data: roleRows }, { data: appt }, { data: offer }] = await Promise.all([
    people.length ? ctx.db.from("profiles").select("id, full_name").in("id", people) : Promise.resolve({ data: [] }),
    people.length ? ctx.db.from("roles").select("user_id, role").in("user_id", people) : Promise.resolve({ data: [] }),
    r.appointment_id ? ctx.db.from("territorial_appointments").select("id, category_label, start_date, end_date, status").eq("id", r.appointment_id).maybeSingle() : Promise.resolve({ data: null }),
    r.offer_id ? ctx.db.from("supplier_offers").select("id, title, commission_pct, commission_note").eq("id", r.offer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nameOf = new Map((names ?? []).map((x) => [x.id, x.full_name as string]));
  const roleOf = new Map((roleRows ?? []).map((x) => [x.user_id, ROLE_LABELS[x.role] ?? x.role]));
  const who = (uid: string | null) => (uid ? `${nameOf.get(uid) ?? "Team member"}${roleOf.get(uid) ? ` (${roleOf.get(uid)})` : ""}` : "FLAME PH program (seeded)");
  const err = sp.error === "db" ? sp.m ?? ERR.failed : sp.error ? ERR[sp.error] ?? ERR.failed : null;
  const draft = r.status === "draft";
  const example = splitCommission(100000, toSplit(r));
  const Item = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs font-bold uppercase text-muted">{k}</dt><dd className="break-words">{v || <span className="text-muted">—</span>}</dd></div>;

  return (
    <div className="space-y-4">
      <CommissionTabs current="rules" national={national} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/commissions/rules" className="underline">Rates</Link> › {r.scope === "agreement" ? r.partner_name : `${CATEGORIES[r.partner_category]} default`}</nav>
      <header>
        <p className="text-xs font-bold uppercase text-muted">{CATEGORIES[r.partner_category]} · {r.scope === "agreement" ? "agreement rate" : "category default"}</p>
        <h1 className="break-words text-2xl font-extrabold text-primary">{r.scope === "agreement" ? r.partner_name : `${CATEGORIES[r.partner_category]} default`}</h1>
        <p className="text-[15px]"><SplitText r={r} /></p>
        <p className="mt-1"><span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${tone(RULE_STATUS[r.status].tone)}`}>{RULE_STATUS[r.status].label}</span></p>
        {r.status_reason && <p className="mt-1 text-sm">Reason: {r.status_reason}</p>}
      </header>
      {sp.done && <div role="status"><Notice tone="ok">{DONE[sp.done] ?? "Saved."}</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card p-4" aria-labelledby="d-h">
        <h2 id="d-h" className="sr-only">Details</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Item k="Applies" v={`${day(r.effective_from)} to ${r.effective_to ? day(r.effective_to) : "until replaced"}`} />
          {r.scope === "agreement" && <>
            <Item k="Agreement" v={`${r.contract_ref}, signed ${day(r.signed_on)}`} />
            <Item k="Territory" v={appt ? <Link href={`/admin/partners/territories/${appt.id}`} className="underline">{appt.category_label} ({day(appt.start_date)} to {day(appt.end_date)})</Link> : "All of this partner's sales"} />
            <Item k="From Best Offer" v={offer ? <Link href={`/admin/partners/offers/${offer.id}`} className="underline">{offer.title ?? "Offer"} (proposed {pct(offer.commission_pct)})</Link> : null} />
          </>}
          <Item k="Basis (shown to partners)" v={r.basis_note} />
          <Item k="Team note" v={r.internal_note} />
          <Item k="Written by" v={`${who(r.created_by)} · ${when(r.created_at)}`} />
          {r.approved_at && <Item k="Approved by" v={`${who(r.approved_by)} · ${when(r.approved_at)}`} />}
          <Item k="Approved sales using it" v={String(used ?? 0)} />
        </dl>
      </section>

      <section className="card space-y-2 p-4" aria-labelledby="ex-h">
        <h2 id="ex-h" className="text-lg font-bold">Example: ₱100,000 qualified net sale</h2>
        <ul className="grid gap-1 text-[15px] sm:grid-cols-2">{example.lines.map((l) => <li key={l.level}>{LEVEL_LABEL[l.level]} {pct(l.pct)}: <strong>{peso2(l.amount)}</strong></li>)}</ul>
        <p className="text-[15px]">Total: <strong>{peso2(example.total)}</strong>. A record only; MarketplacePH Online Store collects and pays.</p>
      </section>

      {national && draft && (
        <details id="edit" className="card scroll-mt-24 p-4" open>
          <summary className="cursor-pointer text-lg font-bold">Edit the draft</summary>
          <form action={saveRule} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <RateInputs d={r} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label htmlFor="effective_from" className="label">First day it applies</label><input id="effective_from" name="effective_from" type="date" required defaultValue={r.effective_from} className="input min-h-11" /></div>
              {r.scope === "agreement" && <>
                <div><label htmlFor="effective_to" className="label">Last day (optional)</label><input id="effective_to" name="effective_to" type="date" defaultValue={r.effective_to ?? ""} className="input min-h-11" /></div>
                <div><label htmlFor="contract_ref" className="label">Agreement number</label><input id="contract_ref" name="contract_ref" required maxLength={120} defaultValue={r.contract_ref ?? ""} className="input min-h-11" /></div>
                <div><label htmlFor="signed_on" className="label">Signed on</label><input id="signed_on" name="signed_on" type="date" required max={manilaDay()} defaultValue={r.signed_on ?? ""} className="input min-h-11" /></div>
                <input type="hidden" name="appointment_id" value={r.appointment_id ?? ""} />
              </>}
            </div>
            <div><label htmlFor="basis_note" className="label">Basis (partners see this)</label><input id="basis_note" name="basis_note" maxLength={1000} defaultValue={r.basis_note ?? ""} className="input min-h-11" /></div>
            <div><label htmlFor="internal_note" className="label">Team note</label><textarea id="internal_note" name="internal_note" maxLength={2000} rows={2} defaultValue={r.internal_note ?? ""} className="input" /></div>
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">Save draft</SubmitButton>
          </form>
        </details>
      )}

      {national && draft && (
        <section id="approve" className="card scroll-mt-24 space-y-3 p-4" aria-labelledby="ap-h">
          <h2 id="ap-h" className="text-lg font-bold">Approve</h2>
          {r.created_by === ctx.user.id ? <Notice tone="info">{ERR.second}</Notice> : (
            <form action={approveRule} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <p className="text-[15px]">{r.scope === "default" ? "From its first day this replaces the current default for the category. Earlier sales keep their rate." : "It applies to this partner's sales from its first day. The partner is told in their Inbox."} After approval it is locked.</p>
              <label className="flex min-h-11 items-start gap-2 text-[15px]"><input type="checkbox" name="no_conflict" value="yes" required className="mt-1 size-5" /><span>I have no conflict of interest with {r.scope === "agreement" ? "this partner" : "any partner affected"}, and I checked the rate against the signed agreement or the program.</span></label>
              <SubmitButton className="btn btn-flame min-h-11 w-full sm:w-auto" pendingText="Approving…">Approve rate</SubmitButton>
            </form>
          )}
        </section>
      )}

      {national && (draft || (r.status === "active" && r.scope === "agreement")) && (
        <section id="end" className="card scroll-mt-24 space-y-2 p-4" aria-labelledby="end-h">
          <h2 id="end-h" className="text-lg font-bold">{draft ? "Cancel the draft" : "Retire this agreement rate"}</h2>
          <form action={endRule} className="space-y-2">
            <input type="hidden" name="id" value={r.id} />
            {!draft && <div><label htmlFor="last_day" className="label">Last day it applies</label><input id="last_day" name="last_day" type="date" required min={r.effective_from} max={r.effective_to ?? undefined} defaultValue={manilaDay()} className="input min-h-11 sm:max-w-xs" /><p className="mt-1 text-xs text-muted">Sales after this day use the category default (or a newer agreement).</p></div>}
            <label htmlFor="reason" className="label">Reason</label>
            <textarea id="reason" name="reason" required maxLength={1000} rows={2} className="input" />
            <SubmitButton className="btn btn-outline min-h-11 w-full sm:w-auto" pendingText="Saving…">{draft ? "Cancel draft" : "Retire"}</SubmitButton>
          </form>
        </section>
      )}
      {r.status === "active" && r.scope === "default" && <p className="text-sm text-muted">A default is never left empty: to change it, add a new default version from a later date on the Rates page.</p>}

      <section className="card space-y-2 p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">History</h2>
        <ol className="space-y-2">
          {(hist ?? []).length === 0 ? <li className="text-sm text-muted">Seeded by the database update from the program&apos;s targets.</li> : (hist ?? []).map((h) => <li key={h.id} className="text-[15px]"><strong className="capitalize">{h.action}</strong> · {who(h.actor_id)} · {when(h.created_at)}{h.note ? <span className="block break-words text-sm text-muted">{h.note}</span> : null}</li>)}
        </ol>
      </section>
    </div>
  );
}
