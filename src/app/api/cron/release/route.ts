import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";
import { STAGES, gates, stageIndex, type Health, type Rollout } from "@/lib/release";

export const dynamic = "force-dynamic";

/**
 * Phase 13, daily at 8:00 AM Manila: while a release stage is being watched (7 days after each stage starts), emails
 * the FLAME PH team the go/no-go list and yesterday's numbers, with a link to Admin → Release.
 * Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const [{ data: roll }, { data: cap }, h] = await Promise.all([
    admin.from("settings").select("value").eq("key", "rollout").maybeSingle(),
    admin.from("settings").select("value").eq("key", "ai_monthly_cap_usd").maybeSingle(),
    admin.rpc("release_health", { p_days: 7 }),
  ]);
  if (h.error) return NextResponse.json({ error: h.error.message }, { status: 500 });
  const rollout = (roll?.value ?? null) as Rollout | null;
  if (!rollout?.monitor_until || new Date(rollout.monitor_until) < new Date()) return NextResponse.json({ watching: false });
  const health = h.data as Health;
  const checks = gates(health, Number(cap?.value ?? 0));
  const bad = checks.filter((g) => !g.ok);
  const stage = STAGES[stageIndex(rollout.stage)];
  const y = health.days[1] ?? health.days[0];
  const ok = await sendEmail({
    to: NOTIFY_TO,
    subject: `FLAME PH release, ${stage.name}: ${bad.length ? `${bad.length} item${bad.length > 1 ? "s" : ""} need attention` : "all clear"}`,
    text: [
      `${stage.name}. Watching until ${new Date(rollout.monitor_until).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" })}.`,
      "",
      ...checks.map((g) => `${g.ok ? "OK " : "FIX"}  ${g.label}: ${g.value} (target ${g.target})`),
      "",
      y ? `Yesterday (${y.day}): ${y.new_members} new members, ${y.errors_browser + y.errors_server} errors, ${y.reports_new} reports (${y.reports_late} late), ${y.cross_site_events} cross-site events, AI $${Number(y.ai_cost_usd).toFixed(2)}.` : "",
      "",
      `Details and the rollback steps: ${ORG.url}/admin/release`,
    ].join("\n"),
  });
  return NextResponse.json({ watching: true, emailed: ok, attention: bad.map((g) => g.key) });
}
