"use client";
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
/** Share of page views that send speed readings (same as VITALS_SAMPLE in src/lib/release.ts). */
const VITALS_SAMPLE = 0.25;

// Phase 13: sends anonymous page-speed readings (1 in 4 page views) and script errors (at most 5 per page view) to
// /api/monitor, for Admin → Release. Nothing about the member is sent: the server keeps only the page pattern.

const send = (data: Record<string, unknown>) => {
  try {
    const body = JSON.stringify({ ...data, p: location.pathname, d: innerWidth >= 1024 ? "desktop" : "mobile" });
    if (!navigator.sendBeacon?.("/api/monitor", body)) fetch("/api/monitor", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch { /* never break the page for a report */ }
};

let sampled: boolean | null = null;
let sentErrors = 0;

export function SiteMonitor() {
  useReportWebVitals((m) => {
    if (sampled === null) sampled = Math.random() < VITALS_SAMPLE;
    if (sampled) send({ t: "vital", n: m.name, v: Math.round(m.name === "CLS" ? m.value * 1000 : m.value) / (m.name === "CLS" ? 1000 : 1) });
  });
  useEffect(() => {
    const report = (msg: unknown) => { if (sentErrors++ < 5) send({ t: "error", m: String(msg ?? "unknown").slice(0, 300) }); };
    const onError = (e: ErrorEvent) => { if (e.message && !/ResizeObserver loop|Script error\.?$/.test(e.message)) report(e.message); };
    const onReject = (e: PromiseRejectionEvent) => report(e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : `Unhandled: ${String(e.reason)}`);
    addEventListener("error", onError);
    addEventListener("unhandledrejection", onReject);
    return () => { removeEventListener("error", onError); removeEventListener("unhandledrejection", onReject); };
  }, []);
  return null;
}

/** For error screens: report the error that the screen is showing. */
export function reportError(err: unknown) {
  if (sentErrors++ < 5) send({ t: "error", m: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
}
