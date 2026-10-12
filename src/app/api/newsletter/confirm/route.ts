import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const admin = createAdminClient();
  const ok = Boolean(admin && /^[a-f0-9]{48}$/.test(token) &&
    !(await admin.from("newsletter_subscribers").update({ confirmed_at: new Date().toISOString() }).eq("confirm_token", token)).error);
  return NextResponse.redirect(new URL(ok ? "/?subscribed=1" : "/contact", req.url));
}
