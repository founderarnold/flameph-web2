import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CLIENTS, HUB, allowedReturn, isV2, signToken, ssoEnabled } from "@/lib/sso";
import { issueTicket, switchOn, validNonce } from "@/lib/ecosystem-sso";

/**
 * Another FLAME PH site asks who this visitor is.
 *   GET /sso/authorize?client=marketplaceph&return=<url on that site>[&silent=1]
 * Signed in here: back to the site's /auth/flame with a token. Not signed in: silent requests go straight back
 * with error=login_required; otherwise the visitor logs in here first and then continues.
 *
 * Phase 10A sites (MarketplacePH, NegosyoDepot) must also send `state` and `nonce`, which they keep in a cookie in the
 * visitor's browser. They get back only a one-time ticket (60 seconds) plus their `state`, and swap the ticket
 * server-to-server at /api/sso/token, which hands the `nonce` back. A ticket started in another browser never matches.
 */
/**
 * Password sign-ups skip the confirmation email, so their email isn't proven until they sign in once with an email
 * code, a link or Google. Only proven emails are shared with other FLAME PH sites.
 */
async function emailProven(supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>, app: Record<string, unknown>) {
  if (!app?.email_unverified) return true;
  const { data } = await supabase.auth.getClaims();
  const amr = (data?.claims?.amr ?? []) as { method?: string }[];
  return amr.some((a) => a.method && a.method !== "password");
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const client = sp.get("client") ?? "";
  const back = allowedReturn(client, sp.get("return"));
  if (!ssoEnabled(client) || !back) return new NextResponse("Unknown site", { status: 400 });

  const v2 = isV2(client);
  const state = sp.get("state");
  const nonce = sp.get("nonce");
  if (v2 && (!validNonce(state) || !validNonce(nonce))) return new NextResponse("Missing sign-in check", { status: 400 });

  const callback = new URL(CLIENTS[client].callback);
  callback.searchParams.set("next", back);
  if (v2) callback.searchParams.set("state", state!);
  const admin = v2 ? createAdminClient() : null;
  if (v2 && (!admin || !(await switchOn(admin, "sso")))) {
    callback.searchParams.set("error", "sso_off"); // the off switch: sites fall back to their own sign-in
    return NextResponse.redirect(callback, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
  }
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  // Phase 12: a closed or suspended account can't sign in to the other sites (they fall back to their own sign-in).
  if (user) {
    const { data: prof } = await supabase!.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (prof && prof.status !== "active") {
      callback.searchParams.set("error", "not_active");
      return NextResponse.redirect(callback, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
    }
  }
  if (user?.email && user.email_confirmed_at && (await emailProven(supabase!, user.app_metadata))) {
    const name = (user.user_metadata?.full_name as string) || undefined;
    if (v2) {
      const code = await issueTicket(admin!, { client, direction: "to_site", userId: user.id, nonce: nonce! });
      if (code) callback.searchParams.set("code", code);
      else callback.searchParams.set("error", "server_error");
    } else {
      callback.searchParams.set("token", signToken({ iss: HUB, aud: client, email: user.email, name }));
    }
  } else if (sp.get("silent") === "1") {
    callback.searchParams.set("error", "login_required");
  } else {
    const self = `/sso/authorize?client=${encodeURIComponent(client)}&return=${encodeURIComponent(back)}${v2 ? `&state=${state}&nonce=${nonce}` : ""}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self)}`, req.url));
  }
  return NextResponse.redirect(callback, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
