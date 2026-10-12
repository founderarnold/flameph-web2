import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "@/lib/env";

/** Supabase client bound to the visitor's session cookies. Returns null when Supabase is not configured. */
export async function createClient(): Promise<SupabaseClient | null> {
  if (!hasSupabase) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a server component; middleware refreshes the session.
        }
      },
    },
  });
}

/** Anonymous client without cookies, safe inside cached functions. Respects RLS (public data only). */
export function createPublicClient(): SupabaseClient | null {
  if (!hasSupabase) return null;
  return createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}

/** Service-role client. Server only; bypasses RLS, so callers must check permissions first. */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createPlainClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}
