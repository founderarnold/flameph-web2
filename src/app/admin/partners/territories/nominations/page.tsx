import Link from "next/link";
import { adminContext } from "@/lib/admin/guard";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { PartnerTabs } from "@/components/admin/PartnerTabs";
import { NOMINATION_STATUS, type NominationStatus } from "@/lib/territory";
import { decideNomination } from "../actions";

export const metadata = { title: "Sub-partner nominations", robots: { index: false } };

type Row = { id: string; nominator_id: string; parent_id: string; nominee_name: string; nominee_contact: string; nominee_phone: string | null; nominee_email: string | null; proposed_area: string; reason: string; status: NominationStatus; decision_note: string | null; appointment_id: string | null; created_at: string };
const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const ERR: Record<string, string> = { status: "That nomination was already decided.", own: "You cannot decide on your own nomination.", note: "Write why it is not accepted. The partner reads it.", failed: "That didn't go through." };

/** Partners' nominations of sub-partners inside their own territory. Accepting only starts a draft appointment; the
 *  national team still checks the nominee and approves (or not). */
export default async function Nominations({ searchParams }: { searchParams: Promise<{ done?: string; error?: string; all?: string }> }) {
  const sp = await searchParams;
  const ctx = await adminContext(["super_admin", "admin", "national_reviewer"]);
  let q = ctx.db.from("territory_nominations").select("*").order("created_at", { ascending: false }).limit(200);
  if (!sp.all) q = q.eq("status", "submitted");
  const { data } = await q;
  const rows = (data ?? []) as Row[];
  const parents = [...new Set(rows.map((r) => r.parent_id))];
  const [{ data: ap }, { data: profs }] = parents.length ? await Promise.all([
    ctx.db.from("territorial_appointments").select("id, category_label, partner_user_id").in("id", parents),
    ctx.db.from("partner_profiles").select("user_id, legal_name").in("user_id", [...new Set(rows.map((r) => r.nominator_id))]),
  ]) : [{ data: [] }, { data: [] }];
  const parentOf = new Map((ap ?? []).map((p) => [p.id, p.category_label as string]));
  const nameOf = new Map((profs ?? []).map((p) => [p.user_id, p.legal_name as string]));

  return (
    <div className="space-y-4">
      <PartnerTabs current="territories" />
      <nav aria-label="Breadcrumb" className="text-sm text-muted"><Link href="/admin/partners/territories" className="underline">Territories</Link> › Sub-partner nominations</nav>
      <h1 className="text-2xl font-extrabold text-primary">Sub-partner nominations</h1>
      <p className="text-sm text-muted">A partner suggests a business to help inside their own territory. Partners never appoint: accepting here only starts a draft under the main appointment, and the nominee must be an accredited partner before you approve it.</p>
      {sp.done && <Notice tone="ok">Saved. The partner was told.</Notice>}
      {sp.error && <Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice>}
      <nav className="flex gap-2"><Link href="/admin/partners/territories/nominations" aria-current={!sp.all ? "page" : undefined} className="chip">Waiting</Link><Link href="/admin/partners/territories/nominations?all=1" aria-current={sp.all ? "page" : undefined} className="chip">All</Link></nav>
      {rows.length === 0 ? <Notice tone="info">No nominations {sp.all ? "yet" : "waiting"}.</Notice> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="card space-y-2 p-4">
              <p className="text-xs font-bold uppercase text-muted">From {nameOf.get(r.nominator_id) ?? "a partner"} · under <Link href={`/admin/partners/territories/${r.parent_id}`} className="underline">{parentOf.get(r.parent_id) ?? "their appointment"}</Link> · {when(r.created_at)}</p>
              <p className="break-words text-lg font-extrabold">{r.nominee_name}</p>
              <p className="break-words text-[15px]">{r.nominee_contact} · {[r.nominee_phone, r.nominee_email].filter(Boolean).join(" · ")}</p>
              <p className="break-words text-[15px]"><strong>Area:</strong> {r.proposed_area}</p>
              <p className="whitespace-pre-line break-words text-[15px]"><strong>Why:</strong> {r.reason}</p>
              <p className="text-sm"><strong>{NOMINATION_STATUS[r.status].label}</strong>{r.decision_note ? ` · ${r.decision_note}` : ""}{r.appointment_id ? <> · <Link href={`/admin/partners/territories/${r.appointment_id}`} className="underline">draft appointment</Link></> : ""}</p>
              {r.status === "accepted" && !r.appointment_id && <Link href={`/admin/partners/territories/new?parent=${r.parent_id}&nomination=${r.id}`} className="btn btn-outline min-h-11 w-full sm:w-auto">Start the draft appointment</Link>}
              {r.status === "submitted" && r.nominator_id !== ctx.user.id && (
                <form action={decideNomination} className="space-y-2 border-t border-line pt-2">
                  <input type="hidden" name="nomination_id" value={r.id} />
                  <label htmlFor={`dn-${r.id}`} className="label text-sm">Note to the partner (needed to decline)</label>
                  <textarea id={`dn-${r.id}`} name="decision_note" rows={2} maxLength={1000} className="input" />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SubmitButton name="decision" value="accepted" className="btn btn-primary min-h-11" pendingText="Saving…">Accept and start a draft</SubmitButton>
                    <SubmitButton name="decision" value="declined" className="btn btn-outline min-h-11" pendingText="Saving…">Decline</SubmitButton>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
