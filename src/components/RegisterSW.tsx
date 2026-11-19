"use client";
import { useEffect } from "react";

// Phase 11: the site installs one app worker, /push-sw.js (offline page + push notifications for members who turned
// them on). Any other worker, and caches left by the old flameph.org, are removed.
const WORKER = "/push-sw.js";
const OURS = /^flameph-(shell|static)-/;

export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => {
      const url = (r.active ?? r.waiting ?? r.installing)?.scriptURL ?? "";
      if (!url.endsWith(WORKER)) r.unregister();
    })).catch(() => {});
    if ("caches" in window) caches.keys().then((ks) => ks.filter((k) => !OURS.test(k)).forEach((k) => caches.delete(k))).catch(() => {});
    // Register after the page has loaded, so it never slows the first visit.
    const go = () => navigator.serviceWorker.register(WORKER).catch(() => {});
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
