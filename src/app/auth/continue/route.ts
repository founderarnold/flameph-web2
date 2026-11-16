import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { needsConsentPrompt } from "@/lib/consents";
import { safeNext } from "@/lib/safe-next";

/**
 * Every sign-in passes through here once. Members who have not accepted the current policies are asked first
 * (they can choose "Not now" and carry on, so nobody is locked out). Everyone else goes straight on.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !data.user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, req.url));
  const ask = await needsConsentPrompt(supabase, data.user.id);
  return NextResponse.redirect(new URL(ask ? `/account/consent?next=${encodeURIComponent(next)}` : next, req.url));
}
