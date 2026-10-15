import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/account";
  const code = url.searchParams.get("code");
  const supabase = await createClient();
  if (!supabase || !code) return NextResponse.redirect(new URL("/login?error=1", req.url));
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // Older emails link here. That link only works in the browser that asked for it, so if the visitor is
    // already signed in (they typed the code), carry on; otherwise let them type the code from the email.
    const { data: me } = await supabase.auth.getUser();
    return NextResponse.redirect(new URL(me.user ? next : `/login?error=1&next=${encodeURIComponent(next)}`, req.url));
  }

  // Google sign-up: record the consent given on the Join page.
  if (url.searchParams.get("consent") === "1") {
    await supabase.from("profiles").update({
      consent_privacy: true,
      consent_marketing: url.searchParams.get("mkt") === "1",
      consent_at: new Date().toISOString(),
    }).eq("id", data.user.id);
    // Invite link (/join?ref=FP-…): credit the member who invited them, only for a brand-new account.
    const ref = url.searchParams.get("ref")?.toUpperCase();
    const admin = createAdminClient();
    const isNew = Date.now() - new Date(data.user.created_at).getTime() < 15 * 60 * 1000;
    if (admin && ref && /^FP-\d{1,10}$/.test(ref) && isNew) {
      const { data: inviter } = await admin.from("profiles").select("id").eq("member_code", ref).maybeSingle();
      if (inviter && inviter.id !== data.user.id) {
        await admin.from("profiles").update({ referred_by: inviter.id }).eq("id", data.user.id).is("referred_by", null);
      }
    }
  }
  return NextResponse.redirect(new URL(next, req.url));
}
