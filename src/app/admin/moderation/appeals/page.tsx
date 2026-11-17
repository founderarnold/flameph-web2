import Link from "next/link";
import { Notice } from "@/components/ui";
import { decideAppeal } from "@/app/account/moderation-actions";
import { requireModerator, peopleNames, type LogEntry } from "@/lib/moderation-data";
import { LOG_LABELS, MOD_ERRORS, clockText } from "@/lib/moderation";

export const metadata = { title: "Appeals" };
type Appeal = { id: string; action_id: number; appellant_id: string; body: string; status: string; created_at: string; due_at: string; decided_at: string | null; decision_note: string | null };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Founders only: members' appeals, oldest first, with a 7-day target. */
export default async function AppealsQueue({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireModerator("/admin/moderation/appeals", 3);
  const [{ data: open }, { data: decided }] = await Promise.all([
    supabase.from("moderation_appeals").select("*").eq("status", "open").order("due_at", { ascending: true }).limit(100),
    supabase.from("moderation_appeals").select("*").neq("status", "open").order("decided_at", { ascending: false }).limit(20),
  ]);
  const appeals = [...(open ?? []), ...(decided ?? [])] as Appeal[];
  const { data: acts } = appeals.length ? await supabase.from("moderation_actions").select("*").in("id", appeals.map((a) => a.action_id)) : { data: [] };
  const actions = new Map(((acts ?? []) as LogEntry[]).map((a) => [a.id, a]));
  const names = await peopleNames(supabase, appeals.map((a) => a.appellant_id));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/moderation" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Queue</Link>
      <h1 className="text-3xl font-extrabold text-primary">Appeals</h1>
      <p className="text-sm text-muted">Founders decide each appeal within 7 days. Reversing undoes the action (unhide, unmute, reactivate or restore the listing). Every decision goes in the audit log.</p>
      {sp.done && <div role="status"><Notice tone="ok">{sp.done === "overturned" ? "Reversed. The member sees the decision in their Notices." : "Decision kept. The member sees it in their Notices."}</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed}</Notice></div>}
      {appeals.length === 0 ? <p className="card p-5 text-muted">No appeals.</p> : (
        <ul className="space-y-3">
          {appeals.map((a) => {
            const act = actions.get(a.action_id);
            return (
              <li key={a.id} className="card space-y-2 p-4">
                <p className="text-xs font-bold">
                  {a.status === "open"
                    ? <span className={`rounded-full px-2 py-0.5 ${new Date(a.due_at).getTime() < Date.now() ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>⏱ {clockText(a.due_at)} of 7 days</span>
                    : <span className="rounded-full bg-bg-soft px-2 py-0.5">{a.status === "overturned" ? "Reversed" : "Kept"} {a.decided_at ? when(a.decided_at) : ""}</span>}
                </p>
                <p className="font-semibold">{names.get(a.appellant_id) ?? "Member"} appeals: {act ? LOG_LABELS[act.action] ?? act.action : "an action"}</p>
                {act?.note && <p className="text-sm text-muted">Moderator&apos;s note: {act.note}</p>}
                <blockquote className="whitespace-pre-wrap rounded-xl bg-bg-soft p-3 text-sm">{a.body}</blockquote>
                {act?.report_id && <Link href={`/admin/moderation/${act.report_id}`} className="inline-flex min-h-11 items-center text-sm text-primary underline">Open the report</Link>}
                {a.decision_note && <p className="text-sm">Decision note: {a.decision_note}</p>}
                {a.status === "open" && a.appellant_id !== user.id && (
                  <form action={decideAppeal} className="space-y-2">
                    <input type="hidden" name="appeal_id" value={a.id} />
                    <label htmlFor={`n-${a.id}`} className="label">Note to the member (optional)</label>
                    <textarea id={`n-${a.id}`} name="note" rows={2} maxLength={500} className="input w-full text-[16px]" />
                    <div className="grid grid-cols-2 gap-2">
                      <button name="decision" value="upheld" className="btn btn-outline min-h-11">Keep decision</button>
                      <button name="decision" value="overturned" className="btn btn-primary min-h-11">Reverse it</button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
