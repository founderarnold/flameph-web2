import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { NOTIFY_TO, sendEmail } from "@/lib/email";
import { ORG } from "@/lib/site";
import { tellApplicant } from "@/lib/partner-server";

export const dynamic = "force-dynamic";

type Due = { id: string; ref_no: string; partner_user_id: string | null; partner_name: string; end_date: string; days_left: number };
type Late = { id: string; ref_no: string; severity: string; status: string; partner_name: string; kind: "first_response" | "resolution"; due_at: string };

/**
 * Hourly: finds partner complaints past their response target (first reply or resolution, set per severity in
 * Admin > Partners > Complaints > Settings) and emails the national team one list. Each case is alerted at most once a
 * day (alerted_at). Also sends the renewal alert for signed partner contracts (0038) once each contract reaches its notice
 * period: one email to the team and one notice to the partner, stamped once (renewal_alerted_at). Nothing renews by itself. Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const renewals = await renewalAlerts(admin);
  const { data, error } = await admin.rpc("complaints_overdue");
  if (error) return NextResponse.json({ error: error.message, renewals }, { status: 500 });
  const late = (data ?? []) as Late[];
  if (late.length === 0) return NextResponse.json({ overdue: 0, renewals });
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
  return NextResponse.json({ overdue: late.length, emailed: sent, renewals });
}

/** Contracts reaching their renewal notice period: the team decides to renew (a new contract) or let it end. */
async function renewalAlerts(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin.rpc("partner_contracts_renewal_due");
  if (error) return { error: error.message };
  const due = (data ?? []) as Due[];
  if (due.length === 0) return { due: 0 };
  const day = (s: string) => new Date(`${s}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
  const sent = await sendEmail({
    to: NOTIFY_TO,
    subject: `${due.length} partner contract${due.length === 1 ? " is" : "s are"} near the end date`,
    text: `These signed partner contracts end soon. Decide for each one: prepare a renewal (a new contract, read and signed again) or let it end. Nothing renews by itself.\n\n${due.map((c) =>
      `${c.ref_no} · ${c.partner_name} · ends ${day(c.end_date)} (${c.days_left} days left)\n${ORG.url}/admin/partners/contracts/${c.id}`).join("\n\n")}`,
  });
  if (!sent) return { due: due.length, emailed: false };
  const now = new Date().toISOString();
  for (const c of due) {
    await admin.from("partner_contracts").update({ renewal_alerted_at: now }).eq("id", c.id).is("renewal_alerted_at", null);
    await admin.from("partner_contract_history").insert({ contract_id: c.id, action: "renewal_alert", note: `Ends ${c.end_date}; renewal alert sent.` });
    if (c.partner_user_id) await tellApplicant(c.partner_user_id, `Contract ${c.ref_no} ends on ${day(c.end_date)}`,
      "Your partner contract ends soon. The FLAME PH national team will contact you about a renewal. Nothing renews by itself.", `/partner-us/contracts/${c.id}`, "FLAME PH partner contract");
  }
  return { due: due.length, emailed: true };
}
