// Phase 13: the staged release (the owner chose "stage the invitations": every feature stays on for current members,
// and FLAME PH invites region by region) and the numbers that decide whether the next stage may start.

export type StageKey = "internal" | "ncr" | "calabarzon" | "central_luzon" | "all";

export type Stage = {
  key: StageKey;
  name: string;
  who: string;
  /** What FLAME PH does to start this stage. */
  start: string[];
  /** How to step back if this stage goes wrong, in the order to try. */
  rollback: string[];
};

const COMMON_ROLLBACK = [
  "Pause: stop sending invitations and posting the announcement for this stage. Set the stage back one step on this page so the daily email keeps watching.",
  "Shared sign-in flag: if sign-in on MarketplacePH or NegosyoDepot misbehaves or a leak is suspected, Admin → Settings → Ecosystem off switches → untick \"Sign in with FLAME PH on the other sites\" (and \"Badges on the other sites\" if badges are involved) → Save switches. Works within a minute, no deploy; members signed in there are signed out within 5 minutes. Tick it again to undo.",
  "If a page or feature broke after a change: in Vercel, open flameph-web2 → Deployments, pick the last deployment marked Ready before the problem, ⋯ → \"Instant Rollback\". It takes under a minute and changes no data.",
  "If data went wrong: restore the backup taken before this stage (Documents\\flameph-backups on the owner's PC). Only with the owner's written OK, because it also removes anything members added since.",
  "If personal data may have leaked: Admin → Privacy and security → start an incident (72-hour clock to the NPC and members).",
];

export const STAGES: Stage[] = [
  { key: "internal", name: "Stage 1: FLAME PH team", who: "Founder, admins, moderators and chapter heads",
    start: ["Take a database backup.", "Ask the team to use every tab for 2 days on their own phones: post, message, Group Order, POS, Ka-FLAME, Academy.", "Report anything odd in the team chat; fix before moving on."],
    rollback: COMMON_ROLLBACK },
  { key: "ncr", name: "Stage 2: NCR", who: "Members and MSMEs in Metro Manila",
    start: ["Take a database backup.", "Post the invitation in the NCR chapter group and FLAME PH pages for Metro Manila.", "Chapter head watches the reports queue (24-hour target)."],
    rollback: COMMON_ROLLBACK },
  { key: "calabarzon", name: "Stage 3: Calabarzon", who: "Cavite, Laguna, Batangas, Rizal and Quezon",
    start: ["Take a database backup.", "Post the invitation for Calabarzon.", "Chapter head watches the reports queue."],
    rollback: COMMON_ROLLBACK },
  { key: "central_luzon", name: "Stage 4: Central Luzon", who: "Pampanga, Bulacan, Tarlac, Nueva Ecija, Bataan, Zambales and Aurora",
    start: ["Take a database backup.", "Post the invitation for Central Luzon.", "Chapter head watches the reports queue."],
    rollback: COMMON_ROLLBACK },
  { key: "all", name: "Open to everyone", who: "All regions", start: ["Announce nationwide."], rollback: COMMON_ROLLBACK },
];

export const stageIndex = (k: string) => Math.max(0, STAGES.findIndex((s) => s.key === k));
export const isStage = (k: string): k is StageKey => STAGES.some((s) => s.key === k);

export type Rollout = { stage: StageKey; started_at?: string; monitor_until?: string; history?: { stage: StageKey; at: string; by?: string; note?: string }[] };

/** The invitation text for a region stage (EN + Taglish), for the owner or chapter head to post. */
export function inviteText(stage: StageKey, site = "https://www.flameph.org") {
  const where = stage === "ncr" ? "Metro Manila" : stage === "calabarzon" ? "Calabarzon" : stage === "central_luzon" ? "Central Luzon" : "the Philippines";
  return `FLAME PH is now open to MSMEs in ${where}! Join free at ${site}/join: post updates, message other members, join Group Orders, use Flame POS, the business calculators, Ka-FLAME AI and the Academy.\n\nBukas na ang FLAME PH sa mga MSME sa ${where}! Sumali nang libre sa ${site}/join: mag-post, mag-message sa ibang member, sumali sa Group Order, at gamitin ang Flame POS, business calculators, Ka-FLAME AI at Academy.`;
}

// ---- Health numbers (from release_health() in supabase/migrations/0030_release_monitor.sql) ----

export type HealthDay = {
  day: string; errors_browser: number; errors_server: number; distinct_errors: number;
  lcp_p75_mobile: number | null; lcp_p75_desktop: number | null; inp_p75: number | null; cls_p75: number | null; speed_samples: number;
  ai_cost_usd: number; ai_questions: number; new_members: number; reports_new: number; reports_in_24h: number; reports_late: number;
  cross_site_events: number; cross_site_refused: number;
};
export type Health = {
  days: HealthDay[];
  now: { members: number; reports_open: number; reports_overdue: number; oldest_open_report_hours: number | null; appeals_open: number; privacy_open: number; privacy_overdue: number;
    alerts_critical: number; alerts_warning: number; incidents_open: number; ai_month_usd: number; db_bytes: number; storage_bytes: number | null; last_security_scan: string | null; last_retention_run: string | null };
  top_errors: { kind: string; path: string; message: string; count: number; last_at: string }[];
  cross_site: { client: string; purpose: string; result: string; n: number }[];
  provinces: { province: string; members: number; new_members: number }[];
};

/** Free plan limits (owner confirmed Supabase Free, 2026-11-19). */
export const FREE_PLAN = { dbBytes: 500 * 1024 * 1024, storageBytes: 1024 * 1024 * 1024, monthlyActiveUsers: 50000, emailsPerDay: 100 };

export type Gate = { key: string; label: string; ok: boolean; value: string; target: string };

/** Go/no-go before inviting the next region. All must pass; any one failing means fix first (or roll back). */
export function gates(h: Health, aiCapUsd: number): Gate[] {
  const d = h.days ?? [];
  const sum = (f: (x: HealthDay) => number) => d.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const p75 = (f: (x: HealthDay) => number | null) => { const v = d.map(f).filter((x): x is number => x !== null && x !== undefined); return v.length ? Math.max(...v) : null; };
  const serverErrors = sum((x) => x.errors_server), browserErrors = sum((x) => x.errors_browser);
  const lcp = p75((x) => x.lcp_p75_mobile), inp = p75((x) => x.inp_p75), cls = p75((x) => x.cls_p75);
  const reports = sum((x) => x.reports_new), late = sum((x) => x.reports_late);
  const refused = sum((x) => x.cross_site_refused), events = sum((x) => x.cross_site_events);
  const n = h.now;
  return [
    { key: "security", label: "No open critical security alert or incident", ok: n.alerts_critical === 0 && n.incidents_open === 0, value: `${n.alerts_critical} critical, ${n.incidents_open} incidents`, target: "0" },
    { key: "server_errors", label: "Server errors (7 days)", ok: serverErrors <= 20, value: String(serverErrors), target: "20 or fewer" },
    { key: "browser_errors", label: "Browser errors (7 days)", ok: browserErrors <= 100, value: String(browserErrors), target: "100 or fewer" },
    { key: "lcp", label: "Page load on phones (worst day, 75% of visits)", ok: lcp === null || lcp <= 3000, value: lcp === null ? "no readings yet" : `${(lcp / 1000).toFixed(1)} s`, target: "3.0 s or less" },
    { key: "inp", label: "Tap response (worst day, 75% of taps)", ok: inp === null || inp <= 300, value: inp === null ? "no readings yet" : `${inp} ms`, target: "300 ms or less" },
    { key: "cls", label: "Layout jumping (worst day)", ok: cls === null || cls <= 0.1, value: cls === null ? "no readings yet" : String(cls), target: "0.1 or less" },
    { key: "reports_24h", label: "Reports handled within 24 hours", ok: late === 0 && n.reports_overdue === 0, value: reports ? `${reports - late} of ${reports} on time, ${n.reports_overdue} overdue now` : `no reports, ${n.reports_overdue} overdue`, target: "all" },
    { key: "privacy", label: "Privacy requests on time", ok: n.privacy_overdue === 0, value: `${n.privacy_overdue} overdue`, target: "0" },
    { key: "cross_site", label: "Cross-site sign-in refusals (7 days)", ok: refused <= Math.max(10, events * 0.1), value: `${refused} of ${events}`, target: "10 or fewer, or under 10%" },
    { key: "ai_cost", label: "Ka-FLAME AI cost this month", ok: !aiCapUsd || n.ai_month_usd <= aiCapUsd * 0.8, value: `$${Number(n.ai_month_usd).toFixed(2)}`, target: aiCapUsd ? `under 80% of the $${aiCapUsd} cap` : "no cap set" },
    { key: "db", label: "Database size (Free plan 500 MB)", ok: n.db_bytes <= FREE_PLAN.dbBytes * 0.8, value: mb(n.db_bytes), target: "under 400 MB" },
    { key: "storage", label: "File storage (Free plan 1 GB)", ok: n.storage_bytes === null || n.storage_bytes <= FREE_PLAN.storageBytes * 0.8, value: n.storage_bytes === null ? "unknown" : mb(n.storage_bytes), target: "under 800 MB" },
  ];
}

export const mb = (b: number | null | undefined) => (b === null || b === undefined ? "unknown" : `${(b / 1024 / 1024).toFixed(1)} MB`);

// ---- Error and speed reports from browsers ----

/** A page address with ids taken out, so reports group by page and never carry a member's id or a search. */
export function pagePattern(raw: string): string {
  let p = "/";
  try { p = new URL(raw, "https://x.invalid").pathname; } catch { p = "/"; }
  return p.split("/").map((seg) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^\d+$/.test(seg) || /^FLM-[A-Z0-9-]+$/i.test(seg) ? ":id" : seg)).join("/").slice(0, 200) || "/";
}

/** An error message without email addresses, long numbers or tokens. */
export function cleanMessage(raw: unknown): string {
  return String(raw ?? "unknown")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, "[token]")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\d{6,}/g, "#")
    .replace(/\s+/g, " ").trim().slice(0, 300) || "unknown";
}

export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
/** Share of page views that send speed readings. */
export const VITALS_SAMPLE = 0.25;
