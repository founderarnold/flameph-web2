import Link from "next/link";
import { Notice } from "@/components/ui";
import { requireModerator, previews, REPORT_COLUMNS, type Report } from "@/lib/moderation-data";
import { LEVEL_NAMES, LOG_LABELS, REASONS, TARGETS, clockText, sortQueue } from "@/lib/moderation";
import { timeAgo } from "@/lib/feed-rules";

export const metadata = { title: "Moderation queue" };

const reasonLabel = (r: string) => (r === "automatic" ? "Automatic filter" : REASONS[r as keyof typeof REASONS]?.label ?? r);

/** The moderation queue. 24-hour clock per report; overdue reports move to the admin queue automatically. */
export default async function ModerationQueue({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const { supabase, level, available, myChapters } = await requireModerator("/admin/moderation");
  if (!available) return <Notice tone="info">Moderation opens after FLAME PH finishes a database update.</Notice>;
  const view = sp.view === "closed" ? "closed" : "open";

  await supabase.rpc("escalate_overdue_reports"); // reports past 24 hours move to the admin queue now, and are logged
  const base = supabase.from("moderation_reports").select(REPORT_COLUMNS);
  const [{ data }, { data: aboutMe }, { data: myGroups }, { count: appeals }] = await Promise.all([
    view === "open"
      ? base.eq("status", "open").order("due_at", { ascending: true }).limit(100)
      : base.neq("status", "open").order("resolved_at", { ascending: false }).limit(50),
    supabase.rpc("reports_about_me"),
    myChapters.length ? supabase.from("community_groups").select("id").in("chapter_id", myChapters) : Promise.resolve({ data: [] as { id: string }[] }),
    level === 3 ? supabase.from("moderation_appeals").select("id", { count: "exact", head: true }).eq("status", "open") : Promise.resolve({ count: 0 }),
  ]);
  const rows = (data ?? []) as Report[];
  const sorted = view === "open" ? sortQueue(rows, level, myChapters, (myGroups ?? []).map((g) => g.id)) : rows;
  const prev = await previews(supabase, sorted.map((r) => r.id));
  const escalated = rows.filter((r) => r.escalated_at).length;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold text-primary">Moderation</h1>
      <p className="text-sm text-muted">You are signed in as <strong>{LEVEL_NAMES[level]}</strong>.{" "}
        {level === 1 ? "You see reports from your chapter first, then the industry groups. Reports not acted on in 24 hours move to the admin queue." : "Escalated reports (no action in 24 hours, or not in any chapter) are at the top."}</p>
      <nav aria-label="Moderation" className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/moderation" aria-current={view === "open" ? "page" : undefined} className={`btn min-h-11 px-3 ${view === "open" ? "btn-primary" : "btn-outline"}`}>Open ({view === "open" ? rows.length : "…"})</Link>
        <Link href="/admin/moderation?view=closed" aria-current={view === "closed" ? "page" : undefined} className={`btn min-h-11 px-3 ${view === "closed" ? "btn-primary" : "btn-outline"}`}>Closed</Link>
        <Link href="/admin/moderation/log" className="btn btn-outline min-h-11 px-3">Audit log</Link>
        {level === 3 && <Link href="/admin/moderation/appeals" className="btn btn-outline min-h-11 px-3">Appeals ({appeals ?? 0})</Link>}
        {level === 3 && <Link href="/admin/moderation/policy" className="btn btn-outline min-h-11 px-3">Policy</Link>}
      </nav>
      {Number(aboutMe) > 0 && <Notice tone="info">{String(aboutMe)} open report{Number(aboutMe) === 1 ? " is" : "s are"} about your own business. Other moderators handle {Number(aboutMe) === 1 ? "it" : "them"}; you can&apos;t see or act on {Number(aboutMe) === 1 ? "it" : "them"}.</Notice>}
      {view === "open" && level >= 2 && escalated > 0 && <p className="text-sm font-semibold text-danger">{escalated} escalated to the admin queue.</p>}

      {sorted.length === 0 ? <p className="card p-5 text-muted">{view === "open" ? "Nothing waiting. Well done." : "No closed reports yet."}</p> : (
        <ul className="space-y-2">
          {sorted.map((r) => {
            const p = prev.get(r.id);
            const overdue = new Date(r.due_at).getTime() < Date.now();
            return (
              <li key={r.id}>
                <Link href={`/admin/moderation/${r.id}`} className={`card block p-3 hover:border-primary ${r.escalated_at && r.status === "open" ? "border-l-4 border-l-danger" : ""}`}>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                    <span className="rounded-full bg-bg-soft px-2 py-0.5 capitalize">{TARGETS[r.target_type as keyof typeof TARGETS] ?? r.target_type}</span>
                    <span className={`rounded-full px-2 py-0.5 ${r.reason === "automatic" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary"}`}>{reasonLabel(r.reason)}</span>
                    {r.status === "open" && r.escalated_at && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">{r.escalation_reason === "no_chapter" ? "Admin queue: no chapter" : `Escalated to admin · ${timeAgo(r.escalated_at)}`}</span>}
                    {r.status === "open" && !r.escalated_at && <span className={`rounded-full px-2 py-0.5 ${overdue ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>⏱ {clockText(r.due_at)}</span>}
                    {r.status !== "open" && <span className="rounded-full bg-bg-soft px-2 py-0.5">{LOG_LABELS[r.resolution ?? ""] ?? r.status}</span>}
                  </span>
                  <span className="mt-1.5 block text-sm font-semibold">{p?.owner_name ?? "Member"}</span>
                  <span className="line-clamp-2 block text-sm text-muted">{p?.preview ?? "(removed)"}</span>
                  <span className="mt-1 block text-xs text-muted">Reported {timeAgo(r.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
