"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while it is on screen, so new messages appear without a reload. */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
