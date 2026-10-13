import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CLIENTS, HUB, allowedReturn, signToken, ssoEnabled } from "@/lib/sso";

/**
 * Another FLAME PH site asks who this visitor is.
 *   GET /sso/authorize?client=marketplaceph&return=<url on that site>[&silent=1]
 * Signed in here: back to the site's /auth/flame with a token. Not signed in: silent requests go straight back
 * with error=login_required; otherwise the visitor logs in here first and then continues.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const client = sp.get("client") ?? "";
  const back = allowedReturn(client, sp.get("return"));
  if (!ssoEnabled() || !back) return new NextResponse("Unknown site", { status: 400 });

  const callback = new URL(CLIENTS[client].callback);
  callback.searchParams.set("next", back);
  const supabase = await createClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;

  if (user?.email && user.email_confirmed_at) {
    callback.searchParams.set("token", signToken({ iss: HUB, aud: client, email: user.email, name: (user.user_metadata?.full_name as string) || undefined }));
  } else if (sp.get("silent") === "1") {
    callback.searchParams.set("error", "login_required");
  } else {
    const self = `/sso/authorize?client=${encodeURIComponent(client)}&return=${encodeURIComponent(back)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(self)}`, req.url));
  }
  return NextResponse.redirect(callback, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
