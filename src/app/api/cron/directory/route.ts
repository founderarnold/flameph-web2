import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { autoReviewWaiting } from "@/lib/listing-auto-review";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly (minute 35): the automatic directory check on every listing that is not public yet, so a listing saved while
 * the check could not run, or a member who has just confirmed their email, still goes public without an admin.
 * Runs from Vercel Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const results = await autoReviewWaiting(admin, 100);
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  if (count("publish")) { revalidateTag("directory"); revalidateTag("content"); revalidatePath("/directory"); }
  return NextResponse.json({ checked: results.length, published: count("publish"), held: count("hold"), high: count("high"), skipped: count("skip"), failed: count("error") });
}
