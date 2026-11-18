import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { allowedReturn } from "@/lib/sso";
import { recordSignout, verifySiteCall } from "@/lib/ecosystem-sso";

/**
 * Another FLAME PH site logged the visitor out, so log them out here too, on every device, and everywhere else.
 *   GET /sso/logout?client=…&return=…&t=<signed by that site, purpose "logout", single use>
 * Without a valid `t` nothing is logged out (so no other website can log members out with a plain link).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const client = sp.get("client") ?? "";
  const back = allowedReturn(client, sp.get("return"));
  const admin = createAdminClient();
  const ok = !!admin && !!back && !!(await verifySiteCall(admin, client, "logout", sp.get("t") ?? ""));
  if (ok) {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) await recordSignout(admin!, user.id);
    await supabase?.auth.signOut({ scope: "global" });
  }
  return NextResponse.redirect(back ?? new URL("/", req.url), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
