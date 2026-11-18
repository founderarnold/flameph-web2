import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CLIENTS, HUB, allowedReturn, isV2, signInByEmail, verifyToken } from "@/lib/sso";
import { EST_COOKIE, newCode, peekTicket } from "@/lib/ecosystem-sso";


const headers = { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };

/**
 * Another FLAME PH site tells us a visitor just signed in or joined there, so they are signed in here too.
 *
 * Phase 10A sites:  GET /sso/establish?code=<one-time ticket>&next=<url on that site>
 *   Step 1 of 2. Nothing is signed in yet. We put a random value in a cookie in THIS browser and send the visitor back to
 *   the site's /auth/flame/push/confirm, which checks that the same browser started the sign-in there, then sends them on
 *   to /sso/establish/finish. A ticket link sent to someone else's browser fails at the site's check.
 *
 * Older sites (none of the Phase 10A sites): GET /sso/establish?token=<signed by that site>&next=…  as before.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  if (code) {
    const admin = createAdminClient();
    const ticket = admin ? await peekTicket(admin, code, "to_hub") : null;
    const back = ticket ? allowedReturn(ticket.client, sp.get("next")) : null;
    if (!ticket || !back || !isV2(ticket.client)) return NextResponse.redirect(new URL("/", req.url), { headers });
    const h = newCode();
    const confirm = new URL("/auth/flame/push/confirm", CLIENTS[ticket.client].callback);
    confirm.searchParams.set("code", code);
    confirm.searchParams.set("h", h);
    confirm.searchParams.set("next", back);
    const res = NextResponse.redirect(confirm, { headers });
    res.cookies.set(EST_COOKIE, h, { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 120 });
    return res;
  }

  const token = sp.get("token") ?? "";
  const issuer = Object.keys(CLIENTS).find((c) => !isV2(c) && token && verifyToken(token, { iss: c, aud: HUB }));
  const back = issuer ? allowedReturn(issuer, sp.get("next")) : null;
  if (!issuer || !back) return NextResponse.redirect(new URL("/", req.url));

  const claims = verifyToken(token, { iss: issuer, aud: HUB })!;
  const [admin, supabase] = [createAdminClient(), await createClient()];
  if (admin && supabase) {
    const current = (await supabase.auth.getUser()).data.user;
    if (current?.email?.toLowerCase() !== claims.email) {
      const ok = await signInByEmail(admin, supabase, claims.email, claims.name);
      if (!ok) console.error("sso/establish: could not sign in", issuer);
    }
  }
  return NextResponse.redirect(back, { headers });
}
