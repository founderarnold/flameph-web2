import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CLIENTS, allowedReturn, signInByEmail } from "@/lib/sso";
import { EST_COOKIE, consumeTicket, issueTicket, log, peekTicket, sha256, switchOn, validNonce } from "@/lib/ecosystem-sso";

const headers = { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" };
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Step 2 of signing in here after signing in on a Phase 10A site.
 *   GET /sso/establish/finish?code&proof&h&state&nonce&next
 * Needs all of: our cookie from step 1 (`h`, same browser here), the site's browser secret (`proof`, whose hash the
 * site gave when it asked for the ticket: same browser there), and an unused ticket. Then signs in by verified email,
 * and sends the visitor back to the site with a normal one-time ticket so the site learns the member's private code.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [code, proof, h, state, nonce] = ["code", "proof", "h", "state", "nonce"].map((k) => sp.get(k) ?? "");
  const cookie = req.cookies.get(EST_COOKIE)?.value ?? "";
  const home = NextResponse.redirect(new URL("/", req.url), { headers });
  home.cookies.set(EST_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });
  const admin = createAdminClient();
  const supabase = await createClient();
  if (!admin || !supabase || !validNonce(h) || !cookie || !same(cookie, h) || !validNonce(proof) || !validNonce(state) || !validNonce(nonce)) return home;

  const peek = await peekTicket(admin, code, "to_hub");
  const back = peek ? allowedReturn(peek.client, sp.get("next")) : null;
  if (!peek || !back || !peek.browser_hash || !same(peek.browser_hash, sha256(proof))) return home;
  const ticket = await consumeTicket(admin, code, peek.client, "to_hub");
  if (!ticket?.email) return home;
  const client = ticket.client;
  if (!(await switchOn(admin, "sso"))) {
    await log(admin, client, null, "sign_in_to_hub", [], "refused", "switch_off");
    return NextResponse.redirect(back, { headers });
  }

  let user = (await supabase.auth.getUser()).data.user;
  if (user?.email?.toLowerCase() !== ticket.email) {
    const ok = await signInByEmail(admin, supabase, ticket.email, ticket.name ?? undefined);
    if (!ok) {
      console.error("sso/establish: could not sign in", client);
      return NextResponse.redirect(back, { headers });
    }
    user = (await supabase.auth.getUser()).data.user;
  }
  if (!user) return NextResponse.redirect(back, { headers });
  await log(admin, client, user.id, "sign_in_to_hub", ["email", "name"], "ok");

  const callback = new URL(CLIENTS[client].callback);
  callback.searchParams.set("next", back);
  callback.searchParams.set("state", state);
  const siteCode = await issueTicket(admin, { client, direction: "to_site", userId: user.id, nonce });
  if (siteCode) callback.searchParams.set("code", siteCode);
  const res = NextResponse.redirect(callback, { headers });
  res.cookies.set(EST_COOKIE, "", { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 0 });
  return res;
}
