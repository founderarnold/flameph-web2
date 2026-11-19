"use client";
import { useEffect, useState } from "react";
import { safeNext } from "@/lib/safe-next";

/**
 * Finishes sign-in from an email link on any page it lands on: Supabase puts the session after the # in the address.
 * Saves it as the normal login cookie, cleans the address, then goes to where the member was headed.
 */
export function EmailLinkSignIn() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const failed = hash.get("error_description") || hash.get("error");
    if (!access_token && !failed) return;
    const next = new URLSearchParams(window.location.search).get("next");
    const to = `/auth/continue?next=${encodeURIComponent(safeNext(next))}`;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (failed || !access_token || !refresh_token) { window.location.replace("/login?error=1"); return; }
    setMsg("Signing you in…");
    // Phase 11: the Supabase library loads only on the rare visit that carries a sign-in link, not on every page.
    import("@/lib/supabase/browser").then(({ createClient }) => createClient()?.auth.setSession({ access_token, refresh_token })).then((r) => {
      window.location.replace(!r || r.error ? "/login?error=1" : to);
    }).catch(() => window.location.replace("/login?error=1"));
  }, []);
  return msg ? <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-primary p-3 text-center font-semibold text-primary-fg">{msg}</div> : null;
}
