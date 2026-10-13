import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CLIENTS, HUB, allowedReturn, signInByEmail, verifyToken } from "@/lib/sso";

/**
 * Another FLAME PH site tells us a visitor just signed in or joined there, so they are signed in here too.
 *   GET /sso/establish?token=<signed by that site>&next=<url on that site>
 * The site signs a token only for emails it has verified. Always sends the visitor back to `next`.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = sp.get("token") ?? "";
  const issuer = Object.keys(CLIENTS).find((c) => token && verifyToken(token, { iss: c, aud: HUB }));
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
  return NextResponse.redirect(back, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
