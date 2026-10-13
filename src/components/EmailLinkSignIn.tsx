"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

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
    const to = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (failed || !access_token || !refresh_token) { window.location.replace("/login?error=1"); return; }
    setMsg("Signing you in…");
    createClient()?.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      window.location.replace(error ? "/login?error=1" : to);
    });
  }, []);
  return msg ? <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-primary p-3 text-center font-semibold text-primary-fg">{msg}</div> : null;
}
