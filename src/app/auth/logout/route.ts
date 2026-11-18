import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { recordSignout } from "@/lib/ecosystem-sso";

/** Log out here, on every device, and on the other FLAME PH sites (they end the session at their next 5-minute check). */
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const admin = createAdminClient();
  if (user && admin) await recordSignout(admin, user.id);
  await supabase?.auth.signOut({ scope: "global" });
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
