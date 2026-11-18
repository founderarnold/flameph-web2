import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { log, readSiteCall, sessionActive, userForSub } from "@/lib/ecosystem-sso";

/**
 * A site checks (at most every 5 minutes) that a member it signed in is still signed in: not logged out anywhere
 * since `since`, account active, shared sign-in switched on. Answers only yes or no.
 *   POST { client, token }   token purpose "sso-status", claims { sub, since (seconds), jti }
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "sso-status");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const { client, claims } = call;
  const userId = await userForSub(admin, client, String(claims.sub ?? ""));
  const since = typeof claims.since === "number" ? claims.since : 0;
  const state = userId ? await sessionActive(admin, userId, since) : { active: false, reason: "unknown_member" };
  if (userId) await log(admin, client, userId, "session_check", [], state.active ? "ok" : "signed_out", state.reason);
  return NextResponse.json({ active: state.active }, { headers: { "Cache-Control": "no-store" } });
}
