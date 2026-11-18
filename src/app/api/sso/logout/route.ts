import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { log, readSiteCall, recordSignout, userForSub } from "@/lib/ecosystem-sso";

/**
 * A member logged out on a site: log them out everywhere (every other site ends their session at its next check).
 *   POST { client, token }   token purpose "sso-logout", claims { sub, jti }
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "sso-logout");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const userId = await userForSub(admin, call.client, String(call.claims.sub ?? ""));
  if (userId) {
    await recordSignout(admin, userId);
    await log(admin, call.client, userId, "logout_notice", [], "ok");
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
