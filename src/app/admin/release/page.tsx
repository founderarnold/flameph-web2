import { Notice } from "@/components/ui";
import { adminContext } from "@/lib/admin/guard";
import { day } from "@/lib/data-rights";
import { STAGES, gates, inviteText, mb, stageIndex, FREE_PLAN, type Health, type Rollout } from "@/lib/release";
import { FOCUS_REGIONS, provincesOf } from "@/lib/regions";
import { setStage } from "./actions";

export const metadata = { title: "Release" };

/**
 * Phase 13: the staged release (team, NCR, Calabarzon, Central Luzon, then everyone) and the 7-day health numbers:
 * errors, page speed, cost, the reports queue and its 24-hour target, and cross-site sign-in activity.
 */
export default async function ReleasePage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const [h, roll, cap] = await Promise.all([
    db.rpc("release_health", { p_days: 7 }),
    db.from("settings").select("value").eq("key", "rollout").maybeSingle(),
    db.from("settings").select("value").eq("key", "ai_monthly_cap_usd").maybeSingle(),
  ]);
  if (h.error || !h.data) return <div className="space-y-4"><h1 className="text-3xl font-extrabold text-primary">Release</h1><Notice tone="info">This opens after FLAME PH finishes a database update (0030).</Notice></div>;
  const health = h.data as Health;
  const rollout = (roll.data?.value ?? { stage: "internal" }) as Rollout;
  const at = stageIndex(rollout.stage);
  const current = STAGES[at];
  const next = STAGES[at + 1];
  const prev = STAGES[at - 1];
  const checks = gates(health, Number(cap.data?.value ?? 0));
  const allOk = checks.every((g) => g.ok);
  const monitoring = rollout.monitor_until && new Date(rollout.monitor_until) > new Date();
  const regionCounts = FOCUS_REGIONS.map((r) => {
    const provs = provincesOf(r).map((p) => p.toLowerCase());
    const rows = health.provinces.filter((p) => provs.includes(p.province.toLowerCase()) || r.match.test(p.province));
    return { name: r.name, members: rows.reduce((a, x) => a + Number(x.members), 0), fresh: rows.reduce((a, x) => a + Number(x.new_members), 0) };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-primary">Release</h1>
      {sp.done === "stage" && <div role="status"><Notice tone="ok">Stage saved. The 7-day watch restarted.</Notice></div>}
      {sp.error && <Notice tone="danger">That didn&apos;t save. Please try again.</Notice>}

      <section className="card space-y-3 p-5" aria-labelledby="stage">
        <h2 id="stage" className="text-lg font-bold">Where we are: {current.name}</h2>
        <p className="text-sm text-muted">{current.who}. Started {rollout.started_at ? day(rollout.started_at) : "–"}. {monitoring ? `Daily health email until ${day(rollout.monitor_until!)}.` : "The 7-day watch has ended."}</p>
        <p className="text-sm">Every feature stays on for every member. Each stage is who we invite next.</p>
        <ol className="flex flex-wrap gap-2 text-sm">
          {STAGES.map((s, i) => <li key={s.key} className={`rounded-full px-3 py-1 ${i === at ? "bg-primary text-white" : i < at ? "bg-success-soft" : "bg-bg-soft"}`}>{i < at ? "✓ " : ""}{s.name}</li>)}
        </ol>
        {next && (
          <div className="space-y-2 rounded-xl border border-line p-4">
            <p className="font-semibold">{allOk ? `Ready for ${next.name}.` : `Not ready for ${next.name}: fix the items marked ✗ below first.`}</p>
            <p className="text-sm text-muted">Wait at least 2 days in each stage. Before starting: {next.start.join(" ")}</p>
            <form action={setStage} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="stage" value={next.key} />
              <label className="grow text-sm">Note (optional)<input name="note" maxLength={300} className="input mt-1 w-full" placeholder="For example: backup done, team checked" /></label>
              <button className={`btn min-h-11 ${allOk ? "btn-primary" : "btn-outline"}`}>Start {next.name}</button>
            </form>
          </div>
        )}
        {next && next.key !== "all" && (
          <details className="text-sm"><summary className="cursor-pointer font-semibold">Invitation text for {next.name} (copy and post)</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl bg-bg-soft p-3 font-sans">{inviteText(next.key)}</pre></details>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="gates">
        <h2 id="gates" className="text-lg font-bold">Go or no-go (last 7 days)</h2>
        <ul className="card divide-y divide-line">
          {checks.map((g) => <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span><span aria-hidden className={g.ok ? "text-success" : "text-danger"}>{g.ok ? "✓" : "✗"}</span> {g.label}<span className="sr-only">{g.ok ? ": OK" : ": needs attention"}</span></span><span className="text-muted">{g.value} <span className="text-xs">(target {g.target})</span></span></li>)}
        </ul>
      </section>

      <section className="space-y-2" aria-labelledby="days">
        <h2 id="days" className="text-lg font-bold">Day by day</h2>
        <div className="card overflow-x-auto p-2">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead><tr className="text-muted">{["Day", "Errors (browser / server)", "Phone load (75%)", "Tap response", "Layout jump", "New members", "Reports (on time / late)", "Cross-site (refused)", "AI cost"].map((t) => <th key={t} scope="col" className="p-2">{t}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {health.days.map((d) => (
                <tr key={d.day}>
                  <td className="p-2">{d.day}</td>
                  <td className="p-2">{d.errors_browser} / {d.errors_server}</td>
                  <td className="p-2">{d.lcp_p75_mobile === null ? "–" : `${(d.lcp_p75_mobile / 1000).toFixed(1)} s`}</td>
                  <td className="p-2">{d.inp_p75 === null ? "–" : `${d.inp_p75} ms`}</td>
                  <td className="p-2">{d.cls_p75 ?? "–"}</td>
                  <td className="p-2">{d.new_members}</td>
                  <td className="p-2">{d.reports_in_24h} / {d.reports_late}{d.reports_new ? ` of ${d.reports_new}` : ""}</td>
                  <td className="p-2">{d.cross_site_events} ({d.cross_site_refused})</td>
                  <td className="p-2">${Number(d.ai_cost_usd).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 p-4">
          <h2 className="font-bold">Right now</h2>
          <ul className="space-y-1 text-sm">
            <li>Members: {health.now.members}</li>
            <li>Reports open: {health.now.reports_open} ({health.now.reports_overdue} past 24 hours{health.now.oldest_open_report_hours !== null ? `, oldest ${health.now.oldest_open_report_hours} h` : ""}). Appeals open: {health.now.appeals_open}.</li>
            <li>Privacy requests open: {health.now.privacy_open} ({health.now.privacy_overdue} overdue)</li>
            <li>Security alerts: {health.now.alerts_critical} critical, {health.now.alerts_warning} warnings. Open incidents: {health.now.incidents_open}.</li>
            <li>Last security check: {health.now.last_security_scan ? day(health.now.last_security_scan) : "none yet"}. Last clean-up: {health.now.last_retention_run ? day(health.now.last_retention_run) : "none yet"}.</li>
          </ul>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="font-bold">Cost and limits</h2>
          <ul className="space-y-1 text-sm">
            <li>Ka-FLAME AI this month: ${Number(health.now.ai_month_usd).toFixed(2)}{cap.data?.value ? ` of the $${cap.data.value} cap` : ""}</li>
            <li>Database: {mb(health.now.db_bytes)} of {mb(FREE_PLAN.dbBytes)} (Supabase Free)</li>
            <li>File storage: {mb(health.now.storage_bytes)} of 1 GB (Supabase Free)</li>
            <li>Emails: Resend free plan sends up to {FREE_PLAN.emailsPerDay} a day.</li>
            <li>Fixed: Vercel Pro $20 a month; Supabase Free $0. No automatic database backups on Free, so take one before each stage.</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-2 p-4">
          <h2 className="font-bold">Members by stage region</h2>
          <ul className="space-y-1 text-sm">{regionCounts.map((r) => <li key={r.name}>{r.name}: {r.members} members ({r.fresh} new in 7 days)</li>)}</ul>
        </div>
        <div className="card space-y-2 p-4">
          <h2 className="font-bold">Cross-site activity (7 days)</h2>
          {health.cross_site.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="space-y-1 text-sm">{health.cross_site.map((x) => <li key={`${x.client}-${x.purpose}-${x.result}`}>{x.client}: {x.purpose.replace(/_/g, " ")}, {x.result}: {x.n}</li>)}</ul>}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="errs">
        <h2 id="errs" className="text-lg font-bold">Most frequent errors (7 days)</h2>
        {health.top_errors.length === 0 ? <p className="card p-4 text-sm text-muted">No errors recorded.</p> : (
          <ul className="card divide-y divide-line text-sm">{health.top_errors.map((e) => <li key={`${e.kind}${e.path}${e.message}`} className="p-3"><strong>{e.count}×</strong> {e.kind} on <code>{e.path}</code>: {e.message} <span className="text-xs text-muted">(last {day(e.last_at)})</span></li>)}</ul>
        )}
      </section>

      <section className="card space-y-2 p-5" aria-labelledby="rollback">
        <h2 id="rollback" className="text-lg font-bold">If something goes wrong in {current.name}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">{current.rollback.map((r) => <li key={r}>{r}</li>)}</ol>
        {prev && (
          <form action={setStage} className="pt-2">
            <input type="hidden" name="stage" value={prev.key} /><input type="hidden" name="note" value="Stepped back" />
            <button className="btn btn-outline min-h-11">Step back to {prev.name}</button>
          </form>
        )}
      </section>
    </div>
  );
}
