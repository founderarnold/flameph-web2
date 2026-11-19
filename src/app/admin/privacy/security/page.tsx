import Link from "next/link";
import { Notice } from "@/components/ui";
import { adminContext } from "@/lib/admin/guard";
import { RETENTION } from "@/lib/retention";
import { day } from "@/lib/data-rights";
import { PrivacyNav } from "@/components/admin/PrivacyNav";
import { dismissSignal, runScanNow } from "../actions";

export const metadata = { title: "Security, abuse and retention" };

type Signal = { id: number; key: string; severity: "info" | "warning" | "critical"; title: string; detail: Record<string, unknown>; first_seen: string; last_seen: string; seen_count: number; incident_id: string | null; dismissed_at: string | null };
type Abuse = { user_id: string; member_code: string | null; joined: string; reports_against: number; blocked_by: number; held_posts: number; messages_24h: number; new_conversations_24h: number; restricted: boolean };
type Run = { id: number; ran_at: string; dry_run: boolean; counts: Record<string, number> };

const TONE = { critical: "bg-danger-soft text-danger", warning: "bg-warn-soft", info: "bg-bg-soft" } as const;

/**
 * Phase 12: what the hourly security scan found (possible breaches and misconfigurations), members showing abuse
 * patterns, and the retention schedule with what the daily clean-up removed.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const sp = await searchParams;
  const { db } = await adminContext(["super_admin", "admin"]);
  const [sig, abuse, runs] = await Promise.all([
    db.from("security_signals").select("*").is("dismissed_at", null).order("last_seen", { ascending: false }).limit(50),
    db.rpc("abuse_signals", { p_days: 7 }),
    db.from("retention_runs").select("*").order("ran_at", { ascending: false }).limit(10),
  ]);
  if (sig.error) return <div className="space-y-4"><h1 className="text-3xl font-extrabold text-primary">Privacy and security</h1><PrivacyNav here="security" /><Notice tone="info">This opens after FLAME PH finishes a database update (0028).</Notice></div>;
  const signals = (sig.data ?? []) as Signal[];
  const people = (abuse.data ?? []) as Abuse[];
  const lastReal = ((runs.data ?? []) as Run[]).find((r) => !r.dry_run);
  const lastDry = ((runs.data ?? []) as Run[]).find((r) => r.dry_run);
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-extrabold text-primary">Privacy and security</h1>
      <PrivacyNav here="security" />
      {sp.done === "scanned" && <div role="status"><Notice tone="ok">Scan done.</Notice></div>}
      {sp.done === "dismissed" && <div role="status"><Notice tone="ok">Dismissed.</Notice></div>}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Security alerts ({signals.length})</h2><form action={runScanNow}><button className="btn btn-outline min-h-11">Scan now</button></form></div>
        <p className="text-sm text-muted">Checked every hour. Warnings and critical alerts are also emailed to the FLAME PH team. If one could mean personal data leaked, start an incident: that starts the 72-hour clock.</p>
        {signals.length === 0 ? <p className="card p-5 text-muted">No open alerts.</p> : (
          <ul className="space-y-2">
            {signals.map((s) => (
              <li key={s.id} className={`card space-y-1 p-4 ${TONE[s.severity]}`}>
                <p className="font-bold">{s.severity === "critical" ? "Critical: " : s.severity === "warning" ? "Warning: " : ""}{s.title}</p>
                <p className="text-xs">First seen {day(s.first_seen)} · last {day(s.last_seen)} · {s.seen_count} times{Object.keys(s.detail ?? {}).length ? ` · ${Object.entries(s.detail).map(([k, v]) => `${k}: ${String(v)}`).join(", ")}` : ""}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {s.incident_id ? <Link className="btn btn-outline min-h-11" href={`/admin/privacy/incidents/${s.incident_id}`}>Open its incident</Link>
                    : <Link className="btn btn-outline min-h-11" href={`/admin/privacy/incidents?signal=${s.id}&title=${encodeURIComponent(s.title)}`}>Start an incident</Link>}
                  <form action={dismissSignal}><input type="hidden" name="id" value={s.id} /><button className="btn btn-outline min-h-11">Checked: not a problem</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Members showing abuse patterns (last 7 days)</h2>
        <p className="text-sm text-muted">3 or more reports against them, 3 or more members blocked them, 3 or more posts held, or a new account sending a lot. Look before acting: open their reports in the Moderation queue.</p>
        {people.length === 0 ? <p className="card p-5 text-muted">Nobody right now.</p> : (
          <div className="card overflow-x-auto p-2">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="text-muted"><th scope="col" className="p-2">Member</th><th scope="col" className="p-2">Joined</th><th scope="col" className="p-2">Reports</th><th scope="col" className="p-2">Blocked by</th><th scope="col" className="p-2">Held posts</th><th scope="col" className="p-2">Messages 24h</th><th scope="col" className="p-2">New chats 24h</th></tr></thead>
              <tbody className="divide-y divide-line">{people.map((p) => <tr key={p.user_id}><td className="p-2">{p.member_code ?? p.user_id.slice(0, 8)}{p.restricted ? " (muted)" : ""}</td><td className="p-2">{day(p.joined)}</td><td className="p-2">{p.reports_against}</td><td className="p-2">{p.blocked_by}</td><td className="p-2">{p.held_posts}</td><td className="p-2">{p.messages_24h}</td><td className="p-2">{p.new_conversations_24h}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">Limits that always apply: posts 10 an hour (3 on the first day), comments 30 an hour, messages 30 in 10 minutes and 300 a day, 20 new conversations a day, 50 Friend requests a day, 20 reports a day. New accounts also get lower limits for their first day or week (conversations, messages, links, Friend requests, requests, records, group orders, reports).</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">How long we keep data</h2>
        <p className="text-sm text-muted">Enforced every day at 2:45 AM Manila time. Last clean-up: {lastReal ? `${day(lastReal.ran_at)}, removed ${Object.values(lastReal.counts).reduce((a, b) => a + Number(b || 0), 0)} rows` : "not run yet"}.{lastDry ? ` Due at the last check: ${Object.values(lastDry.counts).reduce((a, b) => a + Number(b || 0), 0)} rows.` : ""}</p>
        <div className="card overflow-x-auto p-2">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead><tr className="text-muted"><th scope="col" className="p-2">Data</th><th scope="col" className="p-2">Kept for</th></tr></thead>
            <tbody className="divide-y divide-line">{RETENTION.map((r) => <tr key={r.key}><td className="p-2">{r.what}</td><td className="p-2">{r.keep}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
