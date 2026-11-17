import Link from "next/link";
import { Notice } from "@/components/ui";
import { requireModerator, peopleNames, type LogEntry } from "@/lib/moderation-data";
import { LOG_LABELS, MOD_ERRORS } from "@/lib/moderation";

export const metadata = { title: "Moderation audit log" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Every moderation step, newest first, 100 at a time. Nobody can edit or delete it, not even founders. */
export default async function ModerationLog({ searchParams }: { searchParams: Promise<{ before?: string; done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { supabase, level } = await requireModerator("/admin/moderation/log");
  let q = supabase.from("moderation_actions").select("*").order("id", { ascending: false }).limit(100);
  const before = Number(sp.before);
  if (Number.isInteger(before) && before > 0) q = q.lt("id", before);
  const { data } = await q;
  const rows = (data ?? []) as LogEntry[];
  const names = await peopleNames(supabase, rows.flatMap((r) => [r.actor_id, r.target_owner_id]));
  const last = rows[rows.length - 1];
  return (
    <div className="space-y-4">
      <Link href="/admin/moderation" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary"><span aria-hidden>←</span> Queue</Link>
      <h1 className="text-3xl font-extrabold text-primary">Audit log</h1>
      <p className="text-sm text-muted">Every moderation step: who, what, when and why. It can&apos;t be edited or deleted.{level === 1 ? " You see the steps on reports in your area." : ""}</p>
      {sp.done && <div role="status"><Notice tone="ok">Done. It&apos;s in the log.</Notice></div>}
      {sp.error && <div role="alert"><Notice tone="danger">{MOD_ERRORS[sp.error] ?? MOD_ERRORS.failed}</Notice></div>}
      {rows.length === 0 ? <p className="card p-5 text-muted">No moderation steps yet.</p> : (
        <ol className="card divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="p-3 text-sm">
              <p><strong>{LOG_LABELS[r.action] ?? r.action}</strong>{r.target_type ? ` · ${r.target_type}` : ""}{r.target_owner_id ? ` of ${names.get(r.target_owner_id) ?? "a member"}` : ""}</p>
              <p className="text-muted">{r.actor_id ? names.get(r.actor_id) ?? "Moderator" : "System"} ({r.actor_role.replace("_", " ")}) · {when(r.created_at)}{r.until ? ` · until ${when(r.until)}` : ""}</p>
              {r.note && <p>{r.note}</p>}
              {r.report_id && <Link href={`/admin/moderation/${r.report_id}`} className="inline-flex min-h-11 items-center text-primary underline">Open report</Link>}
            </li>
          ))}
        </ol>
      )}
      {rows.length === 100 && last && <Link href={`/admin/moderation/log?before=${last.id}`} className="btn btn-outline min-h-11 w-full">Older entries</Link>}
    </div>
  );
}
