import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { issueTicket, newCode, readSiteCall, switchOn } from "@/lib/ecosystem-sso";

/**
 * A member just signed in on a site (with that site's own sign-in), and the site wants them signed in here too.
 *   POST { client, token }   token purpose "establish-ticket", claims { email, name?, browser (sha256 hex), jti }
 * Gives back a one-time ticket for /sso/establish. `browser` is the hash of a secret the site keeps in the visitor's
 * cookie: the ticket finishes only in that browser (see /sso/establish/finish).
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "establish-ticket");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const { client, claims } = call;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const browser = typeof claims.browser === "string" ? claims.browser : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9a-f]{64}$/.test(browser)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  if (!(await switchOn(admin, "sso"))) return NextResponse.json({ error: "sso_off" }, { status: 403 });
  const name = typeof claims.name === "string" ? claims.name.slice(0, 120) : undefined;
  const code = await issueTicket(admin, { client, direction: "to_hub", email, name, nonce: newCode(), browserHash: browser });
  return code ? NextResponse.json({ code }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "server_error" }, { status: 500 });
}
