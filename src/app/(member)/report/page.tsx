import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fileReport } from "@/app/account/moderation-actions";
import { MOD_ERRORS, REASONS, TARGETS, isReportTarget, type ReportReason } from "@/lib/moderation";
import { safeNext } from "@/lib/safe-next";
import { memberCards } from "@/lib/people";

export const metadata = { title: "Report", robots: { index: false } };

type SP = { type?: string; id?: string; back?: string; sent?: string; error?: string };

/** Report a post, comment, member, business listing or message to the FLAME PH moderators, or dispute a transaction record. */
export default async function ReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const back = safeNext(sp.back ?? "", "/home");
  const { supabase } = await requireUser(`/report?${new URLSearchParams(sp as Record<string, string>)}`);
  const backLink = <Link href={back} className="btn btn-outline min-h-11 w-full">Back</Link>;

  if (sp.sent) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">{sp.sent === "record" ? "Dispute sent" : "Thank you for reporting"}</h1>
        <div role="status"><Notice tone="ok">{sp.sent === "record"
          ? "The record is on hold and doesn't count until a FLAME PH admin reviews it, usually within 24 hours. The other member is told the record is on hold."
          : <>A FLAME PH moderator will look at it within 24 hours. The member isn&apos;t told who reported them.</>}</Notice></div>
        {backLink}
      </div>
    );
  }

  const type = isReportTarget(sp.type) ? sp.type : null;
  const id = sp.id && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : null;
  let what: string | null = null;
  if (type && id) {
    if (type === "post") what = (await supabase.from("feed_posts").select("body").eq("id", id).maybeSingle()).data?.body ?? null;
    if (type === "comment") what = (await supabase.from("feed_comments").select("body").eq("id", id).maybeSingle()).data?.body ?? null;
    if (type === "listing") what = (await supabase.from("businesses").select("name").eq("id", id).maybeSingle()).data?.name ?? null;
    if (type === "member") what = (await memberCards(supabase, [id])).get(id)?.name ?? null;
    // Only the two members in a conversation can read its messages, so only they can report one.
    if (type === "message") what = (await supabase.from("direct_messages").select("body").eq("id", id).maybeSingle()).data?.body ?? null;
    // Only the two members of a record can see it, so only they can dispute it.
    if (type === "record") {
      const r = (await supabase.from("transaction_records").select("deal_date, category, description").eq("id", id).maybeSingle()).data;
      what = r ? `${r.deal_date} · ${r.category}: ${r.description}` : null;
    }
  }
  if (!type || !id || !what) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Report</h1>
        <Notice tone="info">We couldn&apos;t find what you wanted to report. It may have been removed already.</Notice>
        {backLink}
      </div>
    );
  }
  const error = sp.error === "reason" ? "Please choose a reason." : sp.error ? MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={back} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Back</Link>
      <h1 className="text-2xl font-bold">{type === "record" ? "Dispute this transaction record" : `Report this ${TARGETS[type]}`}</h1>
      <blockquote className="card line-clamp-4 border-l-4 border-line p-3 text-sm text-muted">{what}</blockquote>
      <form action={fileReport} className="card space-y-4 p-4" aria-describedby={error ? "report-error" : undefined}>
        <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} />
        <fieldset>
          <legend className="label">What&apos;s wrong?</legend>
          <div className="mt-1 grid gap-2">
            {(Object.keys(REASONS) as ReportReason[]).map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="reason" value={r} required className="mt-1 size-4" />
                <span><span className="block font-semibold">{REASONS[r].label}</span><span className="block text-xs text-muted">{REASONS[r].help}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="report-details" className="label">Anything moderators should know? (optional)</label>
          <textarea id="report-details" name="details" rows={3} maxLength={1000} className="input w-full text-[16px]" />
        </div>
        {type === "record" && <p className="text-sm text-muted">Disputing puts the record on hold: it doesn&apos;t count toward badges, reputation or points until a FLAME PH admin reviews it. The admin sees only this record, then keeps it or voids it.</p>}
        {type === "message" && <p className="text-sm text-muted">Moderators see only this one message, not the rest of your conversation. To stop all messages from this member, use Block in the conversation.</p>}
        {type !== "record" && <p className="text-sm text-muted">Moderators look at reports within 24 hours. The member isn&apos;t told who reported them. If someone is in danger, call 911.</p>}
        {error && <p id="report-error" role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger">{error}</p>}
        <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">{type === "record" ? "Send dispute" : "Send report"}</SubmitButton>
      </form>
    </div>
  );
}
