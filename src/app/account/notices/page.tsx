import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { fileAppeal } from "@/app/account/moderation-actions";
import { MOD_ERRORS, NOTICE_TEXT } from "@/lib/moderation";

export const metadata = { title: "Notices from moderators" };

type Row = { action_id: number; action: string; target_type: string | null; target_id: string | null; note: string | null; until: string | null; created_at: string; appeal_status: string | null; can_appeal: boolean };
const date = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const APPEAL: Record<string, string> = { open: "Appeal sent. A founder will decide within 7 days.", upheld: "Appeal decided: the decision stays.", overturned: "Appeal decided: the decision was reversed." };

/** What moderators did on the member's account or content, with an Appeal button (decided by a founder within 7 days). */
export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const { supabase } = await requireUser("/account/notices");
  const sp = await searchParams;
  const { data, error } = await supabase.rpc("my_moderation_notices");
  const rows = (error ? [] : data ?? []) as Row[];
  const err = sp.error === "short" ? "Please explain a little more (at least 10 characters)." : sp.error ? MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed : null;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Notices from moderators</h1>
      <p className="text-sm text-muted">If a moderator acts on your account or your posts, it shows here. You can appeal within 30 days; a FLAME PH founder decides within 7 days. See the <Link href="/membership/terms" className="underline">Community Guidelines</Link>.</p>
      {sp.done === "appeal" && <div role="status"><Notice tone="ok">Appeal sent. A founder will decide within 7 days.</Notice></div>}
      {err && <div role="alert"><Notice tone="danger">{err}</Notice></div>}
      {rows.length === 0 ? <p className="card p-5 text-muted">No notices. Thank you for keeping the community helpful.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.action_id} id={`notice-${r.action_id}`} className="card scroll-mt-24 space-y-2 p-4">
              <p className="font-semibold">{NOTICE_TEXT[r.action] ?? "A moderator acted on your account."}</p>
              <p className="text-xs text-muted">{date(r.created_at)}{r.until ? ` · until ${date(r.until)}` : ""}</p>
              {r.note && <p className="rounded-xl bg-bg-soft p-3 text-sm">Moderator&apos;s note: {r.note}</p>}
              {r.target_type === "post" && r.target_id && <Link href={`/posts/${r.target_id}`} className="text-sm font-semibold text-primary underline">See the post</Link>}
              {r.appeal_status && <p className="text-sm font-semibold">{APPEAL[r.appeal_status]}</p>}
              {r.can_appeal && (
                <details>
                  <summary className="btn btn-outline min-h-11 w-full cursor-pointer list-none">Appeal this decision</summary>
                  <form action={fileAppeal} className="mt-2 space-y-2">
                    <input type="hidden" name="action_id" value={r.action_id} />
                    <label htmlFor={`appeal-${r.action_id}`} className="label">Why should it be reversed?</label>
                    <textarea id={`appeal-${r.action_id}`} name="body" required minLength={10} maxLength={1000} rows={3} className="input w-full text-[16px]" />
                    <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Sending…">Send appeal</SubmitButton>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
