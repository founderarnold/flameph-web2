import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { consumeTicket, linkSub, log, readSiteCall, switchOn } from "@/lib/ecosystem-sso";

/**
 * A site swaps a one-time sign-in ticket for who the visitor is. Server-to-server only, signed with that site's own key.
 *   POST { client, token }   token purpose "sso-token", claims { code, jti }
 * Gives back only: the member's private code for that site, name, verified email, and the nonce the site started with.
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const call = await readSiteCall(admin, req, "sso-token");
  if (!call) return NextResponse.json({ error: "bad_request" }, { status: 401 });
  const { client, claims } = call;
  const ticket = typeof claims.code === "string" ? await consumeTicket(admin, claims.code, client, "to_site") : null;
  if (!ticket?.user_id) return NextResponse.json({ error: "bad_ticket" }, { status: 400 });
  // Independent lookups run together: each one is a round trip to the database, and the site is waiting.
  const [on, { data }, sub] = await Promise.all([
    switchOn(admin, "sso"),
    admin.auth.admin.getUserById(ticket.user_id),
    linkSub(admin, client, ticket.user_id),
  ]);
  if (!on) {
    await log(admin, client, ticket.user_id, "sign_in", [], "refused", "switch_off");
    return NextResponse.json({ error: "sso_off" }, { status: 403 });
  }
  const user = data?.user;
  if (!user?.email || !user.email_confirmed_at || !sub) return NextResponse.json({ error: "bad_ticket" }, { status: 400 });
  await log(admin, client, user.id, "sign_in", ["name", "email"], "ok");
  return NextResponse.json(
    { sub, email: user.email.toLowerCase(), name: (user.user_metadata?.full_name as string) || null, nonce: ticket.nonce, iat: Math.floor(Date.now() / 1000) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
