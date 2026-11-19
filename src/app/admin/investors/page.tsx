import { Notice } from "@/components/ui";
import { requireModerator, peopleNames } from "@/lib/moderation-data";
import { decideRegistration } from "@/app/account/investor-actions";
import { REGISTRATION_LABEL_MEANING, REGULATORS, registrationLabel, type Regulator } from "@/lib/investor";

export const metadata = { title: "Investor registrations" };

type Row = { user_id: string; regulator: Regulator; registered_name: string; reg_number: string; status: string; submitted_at: string; checked_at: string | null; check_note: string | null };

const DONE: Record<string, string> = { seen: "Saved. The member now shows the dated registration label.", not_found: "Saved. No label is shown." };
const ERR: Record<string, string> = { own: "You can't check your own registration. Ask another admin.", failed: "That didn't go through. Please try again." };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

/**
 * Phase 10B. Admins look up an investor's registration or licence on the regulator's PUBLIC list (for the SEC: its
 * online lists of registered companies and licensed intermediaries) and record what they saw. That makes a dated
 * label, never an endorsement. Each decision goes to the moderation audit log.
 */
export default async function InvestorRegistrations({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireModerator("/admin/investors", 2);
  const { data, error } = await supabase.from("investor_registrations").select("user_id, regulator, registered_name, reg_number, status, submitted_at, checked_at, check_note")
    .order("submitted_at", { ascending: true }).limit(200);
  if (error) return <Notice tone="info">Investor registrations open after FLAME PH finishes a database update.</Notice>;
  const rows = (data ?? []) as Row[];
  const names = await peopleNames(supabase, rows.map((r) => r.user_id));
  const waiting = rows.filter((r) => r.status === "submitted");
  const done = rows.filter((r) => r.status !== "submitted");

  const Card = ({ r }: { r: Row }) => (
    <li className="card space-y-2 p-4">
      <p className="font-semibold">{names.get(r.user_id) ?? "Member"}</p>
      <p className="text-sm">{REGULATORS[r.regulator]} · <strong>{r.registered_name}</strong> · No. {r.reg_number}</p>
      <p className="text-xs text-muted">Sent {day(r.submitted_at)}{r.checked_at ? ` · checked ${day(r.checked_at)}` : ""}{r.check_note ? ` · ${r.check_note}` : ""}</p>
      {r.status === "seen" && <p className="text-sm">Label shown: <span className="rounded-full bg-bg-soft px-2 py-0.5">{registrationLabel({ regulator: r.regulator, checked_at: r.checked_at })}</span></p>}
      {r.status === "not_found" && <p className="text-sm text-muted">Not found. No label is shown.</p>}
      {r.user_id === user.id ? <p className="text-sm text-muted">This is your own. Another admin has to check it.</p> : (
        <form action={decideRegistration} className="space-y-2">
          <input type="hidden" name="user_id" value={r.user_id} />
          <label className="label" htmlFor={`note-${r.user_id}`}>Note (optional): where you looked</label>
          <input id={`note-${r.user_id}`} name="note" maxLength={300} className="input w-full" placeholder="e.g. SEC list of registered corporations" />
          <div className="flex flex-wrap gap-2">
            <button name="seen" value="yes" className="btn btn-primary min-h-11">I saw it on the regulator&apos;s public list</button>
            <button name="seen" value="no" className="btn btn-outline min-h-11">Not found</button>
          </div>
        </form>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold text-primary">Investor registrations</h1>
      {sp.done && DONE[sp.done] && <div role="status"><Notice tone="ok">{DONE[sp.done]}</Notice></div>}
      {sp.error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{ERR[sp.error] ?? ERR.failed}</p>}
      <div className="rounded-xl bg-warn-soft p-3 text-sm text-fg">
        <p className="font-semibold">Before you press &quot;I saw it&quot;</p>
        <p className="mt-1">Look up the exact registered name and number on the regulator&apos;s own public website. Press it only if both match. You are not judging the person, their business or any offer.</p>
        <p className="mt-1">The label members see: {REGISTRATION_LABEL_MEANING}</p>
        <p className="mt-1">Labels drop off after 12 months unless checked again.</p>
      </div>
      <h2 className="text-lg font-bold">Waiting ({waiting.length})</h2>
      {waiting.length === 0 ? <p className="card p-5 text-muted">Nothing waiting.</p> : <ul className="space-y-2">{waiting.map((r) => <Card key={r.user_id} r={r} />)}</ul>}
      <h2 className="text-lg font-bold">Checked ({done.length})</h2>
      {done.length === 0 ? <p className="card p-5 text-muted">None yet.</p> : <ul className="space-y-2">{done.map((r) => <Card key={r.user_id} r={r} />)}</ul>}
    </div>
  );
}
