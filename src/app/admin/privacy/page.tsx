import { Notice } from "@/components/ui";
import { adminContext } from "@/lib/admin/guard";
import { REQUEST_KINDS, STATUS_LABEL, day, type RequestKind, type RequestStatus } from "@/lib/data-rights";
import { closeNow, eraseNow, logRequest, updateRequest } from "./actions";
import { PrivacyNav } from "@/components/admin/PrivacyNav";

export const metadata = { title: "Privacy and security" };

type Req = { id: string; user_id: string | null; member_code: string | null; kind: RequestKind; status: RequestStatus; source: string; details: string | null; created_at: string; due_at: string; erase_after: string | null; hold_reason: string | null; response: string | null; closed_at: string | null };

const DONE: Record<string, string> = { start: "Marked as being handled.", done: "Closed as done.", refused: "Closed with your answer.", hold: "Erasure put on hold.", release: "Hold released: the erasure runs on its date.", erased: "Erased.", closed: "Account closed.", logged: "Request logged. The 15-working-day clock is running." };
const ERR: Record<string, string> = {
  response: "Write the answer the member will see (at least a few words).", reason: "Write why the erasure is on hold (for example, an open dispute or a legal claim).",
  confirm: "Tick the box to confirm.", member: "No member has that member code.", has_staff_role: "This member has a staff or admin role. Remove the role in Members first.",
  prepare_failed: "The erasure didn't start. Nothing was deleted. Please try again.", delete_failed: "Their rows and files were removed but the sign-in account wasn't. Try again.", failed: "That didn't go through. Please try again.",
};


/** Phase 12: the DPO's queue of members' data-rights requests, with the 15-working-day clock. Admins and founders only. */
export default async function PrivacyRequests({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const [open, recent] = await Promise.all([
    db.from("privacy_requests").select("*").in("status", ["open", "in_progress"]).order("due_at").limit(200),
    db.from("privacy_requests").select("*").not("status", "in", "(open,in_progress)").order("closed_at", { ascending: false }).limit(30),
  ]);
  if (open.error) return <div className="space-y-4"><h1 className="text-3xl font-extrabold text-primary">Privacy and security</h1><Notice tone="info">This opens after FLAME PH finishes a database update (0028).</Notice></div>;
  const rows = (open.data ?? []) as Req[];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await db.from("profiles").select("id, full_name, status").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id as string, p]));
  const now = Date.now();

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold text-primary">Privacy and security</h1>
      <PrivacyNav here="requests" />
      {sp.done && DONE[sp.done] && <div role="status"><Notice tone="ok">{DONE[sp.done]}</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{ERR[sp.error] ?? ERR.failed}</Notice></div>}
      <p className="text-sm text-muted">Members&apos; requests under the Data Privacy Act. Answer within 15 working days. Members can download their own data and close or delete their account themselves; what lands here needs a person.</p>

      <h2 className="text-lg font-bold">Open ({rows.length})</h2>
      {rows.length === 0 ? <p className="card p-5 text-muted">Nothing waiting.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const p = r.user_id ? who.get(r.user_id) : null;
            const late = new Date(r.due_at).getTime() < now;
            return (
              <li key={r.id} id={`r-${r.id}`} className="card scroll-mt-24 space-y-2 p-4">
                <p className="flex flex-wrap justify-between gap-2"><b>{REQUEST_KINDS[r.kind]?.label ?? r.kind}</b><span className={late ? "font-bold text-danger" : "text-muted"}>{late ? "Overdue: was due " : "Due "}{day(r.due_at)}</span></p>
                <p className="text-sm">{p?.full_name ?? (r.user_id ? "Member" : "Erased member")} · {r.member_code ?? "no code"} · {STATUS_LABEL[r.status]} · from {r.source === "consent_switch" ? "switch 1 in Settings" : r.source} · {day(r.created_at)}{p?.status === "closed" ? " · account closed" : ""}</p>
                {r.details && <p className="whitespace-pre-line rounded-lg bg-bg-soft p-3 text-sm">{r.details}</p>}
                {r.kind === "erasure" && <p className="text-sm">{r.hold_reason ? <>On hold: {r.hold_reason}</> : <>Erases automatically on <b>{r.erase_after ? day(r.erase_after) : "its due date"}</b> unless you put it on hold.</>}</p>}
                {r.kind === "closure" && <p className="text-sm">Closes automatically on {day(r.due_at)} if the member doesn&apos;t turn switch 1 back on.</p>}
                <div className="flex flex-wrap gap-2 text-sm">
                  {r.user_id && <a className="btn btn-outline min-h-11" href={`/admin/privacy/export/${r.user_id}`}>Download this member&apos;s data</a>}
                  {r.status === "open" && <form action={updateRequest}><input type="hidden" name="request_id" value={r.id} /><button name="step" value="start" className="btn btn-outline min-h-11">I&apos;m handling it</button></form>}
                  {r.kind === "closure" && r.status === "open" && <form action={closeNow}><input type="hidden" name="id" value={r.id} /><button className="btn btn-outline min-h-11">Close the account now</button></form>}
                </div>
                {r.kind === "erasure" && (
                  <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Erase now, or hold</summary>
                    <form action={eraseNow} className="space-y-2 pt-2">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="flex min-h-11 items-start gap-2"><input type="checkbox" name="confirm" className="mt-1 size-5" /><span>Erase this member now. This can&apos;t be undone.</span></label>
                      <button className="btn btn-danger min-h-11">Erase now</button>
                    </form>
                    <form action={updateRequest} className="space-y-2 pt-3">
                      <input type="hidden" name="request_id" value={r.id} />
                      <label className="label" htmlFor={`hold-${r.id}`}>Why keep it for now (a legal reason, such as an open dispute)</label>
                      <input id={`hold-${r.id}`} name="response" className="input w-full" maxLength={500} />
                      <div className="flex flex-wrap gap-2"><button name="step" value="hold" className="btn btn-outline min-h-11">Put on hold</button>{r.hold_reason && <button name="step" value="release" className="btn btn-outline min-h-11">Release hold</button>}</div>
                    </form>
                  </details>
                )}
                {r.kind !== "erasure" && r.kind !== "closure" && (
                  <form action={updateRequest} className="space-y-2 text-sm">
                    <input type="hidden" name="request_id" value={r.id} />
                    <label className="label" htmlFor={`resp-${r.id}`}>Your answer (the member sees it)</label>
                    <textarea id={`resp-${r.id}`} name="response" rows={3} maxLength={2000} className="input w-full" />
                    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="tell" defaultChecked className="size-5" />Also send it to the member by email and in-app</label>
                    <div className="flex flex-wrap gap-2"><button name="step" value="done" className="btn btn-primary min-h-11">Done</button><button name="step" value="refused" className="btn btn-outline min-h-11">Can&apos;t do it (explain why)</button></div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section id="log" aria-labelledby="log-h" className="card scroll-mt-24 space-y-2 p-4">
        <h2 id="log-h" className="text-lg font-bold">A request came by email or letter</h2>
        <form action={logRequest} className="grid gap-2 sm:grid-cols-2">
          <div><label className="label" htmlFor="lc">Member code (FP-…)</label><input id="lc" name="member_code" required className="input w-full" /></div>
          <div><label className="label" htmlFor="lk">Kind</label><select id="lk" name="kind" className="input w-full">{(["access", "portability", "correction", "objection", "erasure"] as RequestKind[]).map((k) => <option key={k} value={k}>{REQUEST_KINDS[k].label}</option>)}</select></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ld">What they asked</label><textarea id="ld" name="details" rows={2} maxLength={2000} className="input w-full" /></div>
          <button className="btn btn-outline min-h-11 w-fit">Log it</button>
        </form>
      </section>

      <h2 className="text-lg font-bold">Recently closed</h2>
      {(recent.data ?? []).length === 0 ? <p className="card p-5 text-muted">None yet.</p> : (
        <ul className="card divide-y divide-line p-2 text-sm">
          {((recent.data ?? []) as Req[]).map((r) => <li key={r.id} className="p-2"><b>{REQUEST_KINDS[r.kind]?.label ?? r.kind}</b> · {r.member_code ?? "erased"} · {STATUS_LABEL[r.status]} {r.closed_at ? day(r.closed_at) : ""}{r.response ? ` · ${r.response}` : ""}</li>)}
        </ul>
      )}
    </div>
  );
}
