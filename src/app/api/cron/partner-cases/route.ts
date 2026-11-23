import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NOTIFY_TO, sendEmail } from "@/lib/email";
import { ORG } from "@/lib/site";

export const dynamic = "force-dynamic";

type Late = { id: string; ref_no: string; severity: string; status: string; partner_name: string; kind: "first_response" | "resolution"; due_at: string };

/**
 * Hourly: finds partner complaints past their response target (first reply or resolution, set per severity in
 * Admin > Partners > Complaints > Settings) and emails the national team one list. Each case is alerted at most once a
 * day (alerted_at). Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { data, error } = await admin.rpc("complaints_overdue");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const late = (data ?? []) as Late[];
  if (late.length === 0) return NextResponse.json({ overdue: 0 });
  const critical = late.some((c) => c.severity === "critical");
  const lines = late.map((c) =>
    `${c.ref_no} · ${c.severity} · ${c.partner_name} · ${c.kind === "first_response" ? "no first reply yet" : "not resolved yet"} (target was ${new Date(c.due_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })})\n${ORG.url}/admin/partners/complaints/${c.id}`);
  const sent = await sendEmail({
    to: NOTIFY_TO,
    subject: `${critical ? "URGENT: " : ""}${late.length} partner complaint${late.length === 1 ? " is" : "s are"} past the response target`,
    text: `These partner complaints are past their target. Please reply or move them forward.\n\n${lines.join("\n\n")}\n\nTargets can be changed in Admin > Partners > Complaints > Settings.`,
  });
  // Stamp only after the email went out, so a failed send is tried again next hour.
  if (sent) await admin.from("partner_complaints").update({ alerted_at: new Date().toISOString() }).in("id", late.map((c) => c.id));
  return NextResponse.json({ overdue: late.length, emailed: sent });
}
