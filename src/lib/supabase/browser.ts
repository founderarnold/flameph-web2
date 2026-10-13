"use client";
import { createBrowserClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "@/lib/env";

export function createClient() {
  if (!hasSupabase) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Only for sending sign-in emails. With the "implicit" flow the link in Supabase's default email lands back here with
 * the session in the address (#access_token=…), so it works in any browser or app the member opens it in
 * (Gmail, Facebook, another phone). The default PKCE link only works in the browser that asked for it.
 * EmailLinkSignIn picks the session up on whatever page the link lands on.
 */
export function createEmailLinkClient() {
  if (!hasSupabase) return null;
  return createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
