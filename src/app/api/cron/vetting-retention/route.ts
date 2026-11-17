import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { purgeDueDocs } from "@/lib/vetting-server";

export const dynamic = "force-dynamic";

/**
 * Daily: deletes vetting documents whose retention has ended (vetting decided more than 1 year ago) or whose member
 * turned off switch 4. Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { deleted, error } = await purgeDueDocs(admin);
  return NextResponse.json({ deleted, error });
}
