import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail, NOTIFY_TO } from "@/lib/email";
import { ORG } from "@/lib/site";

export const dynamic = "force-dynamic";

type Signal = { id: number; key: string; severity: "info" | "warning" | "critical"; title: string; detail: Record<string, unknown>; emailed_at: string | null };

/**
 * Phase 12, hourly: the security scan (possible breaches and misconfigurations, deadlines, abuse). New warnings and
 * critical alerts are emailed to the FLAME PH team once, with a link to Admin → Privacy and security.
 * Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { data, error } = await admin.rpc("security_scan");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const found = (data ?? []) as Signal[];
  const tell = found.filter((s) => s.severity !== "info" && !s.emailed_at);
  if (tell.length) {
    const critical = tell.some((s) => s.severity === "critical");
    const ok = await sendEmail({
      to: NOTIFY_TO,
      subject: `${critical ? "URGENT: " : ""}FLAME PH security alert: ${tell[0].title}${tell.length > 1 ? ` (+${tell.length - 1} more)` : ""}`,
      text: [
        "The hourly security check found:",
        "",
        ...tell.map((s) => `- ${s.severity.toUpperCase()}: ${s.title}${Object.keys(s.detail ?? {}).length ? ` (${Object.entries(s.detail).map(([k, v]) => `${k}: ${String(v)}`).join(", ")})` : ""}`),
        "",
        `Look at it here: ${ORG.url}/admin/privacy/security`,
        "If personal data may have leaked, start an incident there: the NPC and affected members must be told within 72 hours when there is a real risk of serious harm.",
      ].join("\n"),
    });
    if (ok) await admin.from("security_signals").update({ emailed_at: new Date().toISOString() }).in("id", tell.map((s) => s.id));
  }
  return NextResponse.json({ found: found.length, emailed: tell.length });
}
