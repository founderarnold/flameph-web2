"use client";
import { useEffect } from "react";

// The site no longer installs an offline worker. Remove any worker and saved pages left by the old flameph.org
// (the push-notification worker, /push-sw.js, is the only one kept).
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Keep only the push-notification worker a member turned on.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => {
      const url = (r.active ?? r.waiting ?? r.installing)?.scriptURL ?? "";
      if (!url.endsWith("/push-sw.js")) r.unregister();
    })).catch(() => {});
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }, []);
  return null;
}
