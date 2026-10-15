"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

/** Counts one view per visit and a click on any element marked data-track inside the listing. */
export function ListingTracker({ bizId }: { bizId: string }) {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const key = `viewed-${bizId}`;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; sessionStorage.setItem(key, "1"); } catch {}
    if (!seen) void supabase.rpc("track_business", { biz: bizId, kind: "view" });
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-track]")) void supabase.rpc("track_business", { biz: bizId, kind: "click" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [bizId]);
  return null;
}
