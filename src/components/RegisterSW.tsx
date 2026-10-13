"use client";
import { useEffect } from "react";

// The site no longer installs an offline worker. Remove any worker and saved pages left by the old flameph.org.
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if ("caches" in window) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  }, []);
  return null;
}
