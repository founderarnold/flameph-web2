import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { moderateReport, overrideAction } from "@/app/account/moderation-actions";
import { requireModerator, previews, peopleNames, REPORT_COLUMNS, type LogEntry, type Report } from "@/lib/moderation-data";
import { ACTIONS, LOG_LABELS, MOD_ERRORS, REASONS, TARGETS, actionsFor, clockText } from "@/lib/moderation";

export const metadata = { title: "Report" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const UNDOABLE = ["hide_in_group", "hide", "auto_hold", "mute", "mute_7d", "ban", "suspend", "remove_listing"];

/** One report: what was reported, its 24-hour clock, its history, and the actions this moderator's role allows. */
export default async function ReportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const { supabase, level, user } = await requireModerator(`/admin/moderation/${id}`);
  const { data } = await supabase.from("moderation_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound(); // also when the report is about this moderator's own business
  const r = data as Report;
  const [prev, { data: logRows }] = await Promise.all([
    previews(supabase, [id]),
    supabase.from("moderation_actions").select("*").eq("report_id", id).order("id", { ascending: true }).limit(50),
  ]);
  const log = (logRows ?? []) as LogEntry[];
  const names = await peopleNames(supabase, [r.reporter_id, ...log.map((l) => l.actor_id)]);
  const p = prev.get(id);
  const options = actionsFor(level, r.target_type);
  const back = `/admin/moderation/${id}`;
  const err = sp.error ? MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/moderation" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Queue</Link>
      <h1 className="text-2xl font-extrabold">Report: {TARGETS[r.target_type as keyof typeof TARGETS] ?? r.target_type}</h1>
      {sp.done && <div role="status"><Notice tone="ok">Done: {LOG_LABELS[sp.done] ?? sp.done}. It&apos;s in the audit log.</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}

      <section className="card space-y-2 p-4" aria-labelledby="what-h">
        <h2 id="what-h" className="font-bold">What was reported</h2>
        <p className="text-sm font-semibold">{p?.owner_name ?? "Member"}</p>
        <blockquote className="whitespace-pre-wrap rounded-xl bg-bg-soft p-3 text-sm">{p?.preview ?? "(removed)"}</blockquote>
        {p?.link && <Link href={p.link} className="text-sm font-semibold text-primary underline">Open it</Link>}
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="inline font-semibold">Reason: </dt><dd className="inline">{r.reason === "automatic" ? "Automatic filter" : REASONS[r.reason as keyof typeof REASONS]?.label}</dd></div>
          <div><dt className="inline font-semibold">Reported by: </dt><dd className="inline">{r.reporter_id ? names.get(r.reporter_id) ?? "A member" : "Automatic filter"}</dd></div>
          <div><dt className="inline font-semibold">Reported: </dt><dd className="inline">{when(r.created_at)}</dd></div>
          <div><dt className="inline font-semibold">Clock: </dt><dd className="inline">{r.status !== "open" ? "Closed" : r.escalated_at ? (r.escalation_reason === "no_chapter" ? "Admin queue (not in any chapter)" : `Escalated to admin ${when(r.escalated_at)}`) : clockText(r.due_at)}</dd></div>
        </dl>
        {r.details && <p className="text-sm"><span className="font-semibold">Details: </span>{r.details}</p>}
      </section>

      <section className="card p-4" aria-labelledby="act-h">
        <h2 id="act-h" className="font-bold">Take action</h2>
        {r.target_owner_id === user.id ? <p className="mt-2 text-sm text-muted">{MOD_ERRORS.own_business}</p> : (
          <form action={moderateReport} className="mt-2 space-y-3">
            <input type="hidden" name="report_id" value={r.id} />
            <fieldset>
              <legend className="sr-only">Action</legend>
              <div className="grid gap-2">
                {options.map((a) => (
                  <label key={a} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input type="radio" name="action" value={a} required className="mt-1 size-4" />
                    <span><span className="block font-semibold">{ACTIONS[a].label}</span><span className="block text-xs text-muted">{ACTIONS[a].help}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {level >= 2 && (
              <div>
                <label htmlFor="days" className="label">Days (for Mute)</label>
                <input id="days" name="days" type="number" min={1} max={30} defaultValue={7} className="input min-h-11 w-28" />
              </div>
            )}
            <div>
              <label htmlFor="note" className="label">Note to the member (shown with a warning or mute; optional)</label>
              <textarea id="note" name="note" rows={2} maxLength={500} className="input w-full text-[16px]" />
            </div>
            <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Saving…">Confirm action</SubmitButton>
          </form>
        )}
      </section>

      <section className="card p-4" aria-labelledby="hist-h">
        <h2 id="hist-h" className="font-bold">History</h2>
        {log.length === 0 ? <p className="mt-2 text-sm text-muted">No actions yet.</p> : (
          <ol className="mt-2 divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="py-2 text-sm">
                <p><strong>{LOG_LABELS[l.action] ?? l.action}</strong> · {l.actor_id ? names.get(l.actor_id) ?? "Moderator" : "System"} ({l.actor_role.replace("_", " ")}) · {when(l.created_at)}</p>
                {l.note && <p className="text-muted">{l.note}</p>}
                {level === 3 && UNDOABLE.includes(l.action) && l.target_owner_id !== user.id && (
                  <form action={overrideAction} className="mt-1">
                    <input type="hidden" name="action_id" value={l.id} /><input type="hidden" name="back" value={back} />
                    <button className="btn btn-outline min-h-11 px-3 text-sm">Override: undo this</button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
