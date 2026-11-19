import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runPrivacyJobs } from "@/lib/data-rights-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 12, daily (2:30 AM Manila): the retention clean-up (Privacy Notice, section 5), accounts whose switch 1 stayed
 * off for 15 working days, and erasures that are due (requests past their 7 days, and accounts closed for 1 year).
 * Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  return NextResponse.json(await runPrivacyJobs(admin));
}
