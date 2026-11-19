"use client";
import { useEffect } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "@/lib/env";

/**
 * Counts one view per visit and a click on any element marked data-track inside the listing.
 * Phase 11: a plain request to the same public function (track_business, open to visitors) instead of loading the whole
 * Supabase library on every business page. keepalive lets a click count even when it opens another page.
 */
function track(bizId: string, kind: "view" | "click") {
  void fetch(`${SUPABASE_URL}/rest/v1/rpc/track_business`, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ biz: bizId, kind }),
  }).catch(() => {});
}

export function ListingTracker({ bizId }: { bizId: string }) {
  useEffect(() => {
    if (!hasSupabase) return;
    const key = `viewed-${bizId}`;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch {}
    if (!seen) track(bizId, "view");
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-track]")) track(bizId, "click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [bizId]);
  return null;
}
