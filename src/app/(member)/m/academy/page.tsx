import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell } from "@/components/shell/TabShell";
import { EmptyState } from "@/components/ui";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { list, eventsByType } from "@/lib/content";
import { academyProgress, pct, type Course } from "@/lib/academy";
import { toggleCourse } from "@/app/account/actions";

export const metadata = { title: "FLAME PH Academy" };

type ResourceLite = { id: string; title: string; slug: string; type: string; stage: string | null };

const when = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const isExternal = (u: string) => /^https?:\/\//i.test(u) && !/^https?:\/\/(www\.)?flameph\.org(\/|$)/i.test(u);

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(4, value)}%` }} />
    </div>
  );
}

/**
 * FLAME PH Academy for signed-in members (members see this at /academy; visitors keep the public page).
 * Reuses the courses admins publish in Admin → Content → Academy courses, and the growth path's private milestones for progress.
 */
export default async function AcademyTab() {
  const { supabase, user, roles } = await requireUser("/academy");
  const [courses, resources, trainings, { data: profile }, { data: ms }] = await Promise.all([
    list<Course>({ table: "courses", select: "id,title,stage,summary,url", order: "created_at", ascending: true, limit: 200 }),
    list<ResourceLite>({ table: "resources", select: "id,title,slug,type,stage", order: "last_reviewed", limit: 100 }),
    eventsByType(["training", "webinar", "workshop"]),
    supabase.from("profiles").select("business_stage").eq("id", user.id).maybeSingle(),
    supabase.from("member_milestones").select("key").eq("user_id", user.id).limit(500),
  ]);
  const stage = profile?.business_stage ?? null;
  const p = academyProgress(courses, (ms ?? []).map((m) => m.key), stage);
  const forStage = resources.filter((r) => stage && r.stage === stage);
  const picks = (forStage.length ? forStage : resources).slice(0, 4);
  const next = trainings.upcoming.slice(0, 3);
  const canEdit = roles.some((r) => r === "super_admin" || r === "admin" || r === "editor");

  return (
    <TabShell title="FLAME PH Academy" fil="Matuto ayon sa yugto ng negosyo mo"
      intro="Learning tracks by business stage. Mark a course done when you finish it, and your progress is saved here and in your growth path.">
      <section aria-labelledby="ac-progress" className="card space-y-4 p-4">
        <h2 id="ac-progress" className="text-lg font-bold">Your progress</h2>
        <div>
          <p className="font-semibold">{p.finished} of {p.total} course{p.total === 1 ? "" : "s"} done</p>
          <Bar value={pct(p.finished, p.total)} label="Courses done" />
        </div>
        {p.stage ? (
          <div>
            <p className="font-semibold">{p.stage.label} stage: {p.stage.done} of {p.stage.of} growth milestones</p>
            <Bar value={pct(p.stage.done, p.stage.of)} label={`${p.stage.label} stage milestones done`} />
          </div>
        ) : <p className="text-sm text-muted">Pick your business stage so we can show the courses that fit you first.</p>}
        <Link href="/account/growth" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{p.stage ? "Open my growth path" : "Pick my stage"}</Link>
      </section>

      {p.total === 0 && <EmptyState title="Wala pang published na course." text="The first courses are being prepared. Get notified when they open, and join a training or webinar meanwhile." />}

      <section aria-labelledby="ac-tracks" className="space-y-3">
        <h2 id="ac-tracks" className="text-lg font-bold">Learning tracks</h2>
        <ul className="space-y-3">
          {p.tracks.map((t) => (
            <li key={t.key} className={`card p-4 ${t.here ? "border-2 border-flame" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-primary">{t.name}{t.here && <span className="ml-2 text-xs font-bold uppercase text-flame-strong">Your stage</span>}</h3>
                {t.items.length > 0 && <span className="shrink-0 text-sm text-muted">{t.done} of {t.items.length} done</span>}
              </div>
              <p className="text-sm text-muted">{t.text}</p>
              {t.items.length === 0 ? <p className="mt-2 text-sm font-semibold text-warn">Coming soon</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {t.items.map((c) => {
                    const done = p.isDone(c);
                    return (
                      <li key={c.id} id={`course-${c.id}`} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          {c.url ? (
                            isExternal(c.url)
                              ? <a href={c.url} target="_blank" rel="noopener" className="font-semibold text-mph underline">{c.title}<span className="sr-only"> (opens in a new tab)</span></a>
                              : <a href={c.url} className="font-semibold text-mph underline">{c.title}</a>
                          ) : <span className="font-semibold">{c.title}</span>}
                          {c.summary && <p className="text-sm text-muted">{c.summary}</p>}
                        </div>
                        <form action={toggleCourse}>
                          <input type="hidden" name="course_id" value={c.id} /><input type="hidden" name="done" value={done ? "0" : "1"} />
                          <button aria-pressed={done} aria-label={`${done ? "Mark not done" : "Mark done"}: ${c.title}`}
                            className={`btn min-h-11 shrink-0 px-3 text-sm ${done ? "btn-outline border-ok text-ok" : "btn-primary"}`}>{done ? "✓ Done" : "Mark done"}</button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ac-live" className="card p-4">
        <h2 id="ac-live" className="text-lg font-bold">Trainings, webinars and workshops</h2>
        {next.length === 0 ? <p className="mt-1 text-sm text-muted">No upcoming sessions yet. New ones show here as soon as they are posted.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {next.map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-xs font-bold uppercase text-flame-strong">{e.type}</p>
                <p className="font-semibold">{e.title}</p>
                <p className="text-sm text-muted">{when(e.starts_at)}{e.city ? ` · ${e.city}` : e.online_url ? " · Online" : ""}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex flex-wrap gap-x-4">
          <Link href="/trainings-webinars" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Trainings and webinars</Link>
          <Link href="/workshops" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Workshops</Link>
        </p>
      </section>

      <section aria-labelledby="ac-res" className="card p-4">
        <h2 id="ac-res" className="text-lg font-bold">{forStage.length ? "Guides for your stage" : "Guides and templates"}</h2>
        {picks.length === 0 ? <p className="mt-1 text-sm text-muted">Our first guides are being reviewed.</p> : (
          <ul className="mt-2 divide-y divide-line">
            {picks.map((r) => (
              <li key={r.id}><Link href={`/resources/${r.slug}`} className="flex min-h-11 flex-col justify-center py-2"><span className="font-semibold hover:underline">{r.title}</span><span className="text-xs uppercase text-muted">{r.type}{r.stage ? ` · ${r.stage}` : ""}</span></Link></li>
            ))}
          </ul>
        )}
        <Link href={stage ? `/resources?stage=${stage}` : "/resources"} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">All resources</Link>
      </section>

      {p.total === 0 && <div className="card p-4"><SubmissionForm def={FORMS["academy-waitlist"]} /></div>}

      <p className="flex flex-wrap gap-x-4">
        {canEdit && <Link href="/admin/content/courses" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Edit courses (admin)</Link>}
        <Link href="/academy?view=public" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Public Academy page</Link>
      </p>
    </TabShell>
  );
}
