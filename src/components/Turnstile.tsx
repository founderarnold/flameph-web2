"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Turnstile({ action, onToken, resetKey = 0 }: { action: string; onToken: (token: string) => void; resetKey?: number }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  // Phase 11: Cloudflare's check is about 1.7 MB. It loads only when the visitor starts using the form (a tap, a click
  // or typing in it), or after the form has been on screen for a few seconds, never just because a page has a form
  // somewhere (like the newsletter box in the footer). Visitors who never use a form never download it.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    const box = container.current;
    if (!box || wanted) return;
    const scope: HTMLElement = box.closest("form") ?? box.parentElement ?? box;
    const go = () => setWanted(true);
    const events = ["focusin", "pointerdown", "touchstart", "keydown"] as const;
    events.forEach((t) => scope.addEventListener(t, go, { once: true, passive: true }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { if (!timer) timer = setTimeout(go, 4000); }
      else if (timer) { clearTimeout(timer); timer = undefined; }
    }) : null;
    io?.observe(box);
    return () => { events.forEach((t) => scope.removeEventListener(t, go)); io?.disconnect(); if (timer) clearTimeout(timer); };
  }, [wanted]);

  const render = useCallback(() => {
    if (!siteKey || !container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme: "auto",
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => onTokenRef.current(""),
      "error-callback": () => onTokenRef.current(""),
      "timeout-callback": () => onTokenRef.current(""),
    });
  }, [action, siteKey]);

  useEffect(() => {
    if (!siteKey && process.env.NODE_ENV === "development") onTokenRef.current("development-bypass");
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    onTokenRef.current("");
  }, [resetKey]);

  if (!siteKey) {
    return process.env.NODE_ENV === "development"
      ? <p className="text-xs text-muted">Bot protection development mode</p>
      : <p role="alert" className="rounded-lg bg-warn-soft p-3 text-sm font-semibold text-warn">Security check is unavailable. Please try again later.</p>;
  }

  return (
    <div className="min-h-[65px]" aria-label="Security check">
      {wanted && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={render} />}
      <div ref={container} />
    </div>
  );
}
