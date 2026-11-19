"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install the FLAME PH app" (Phase 11). Android/Chrome: one tap opens the install box. iPhone: Safari has no install
 * box, so it shows the two steps. Hidden when already installed (opened from the home screen).
 */
export function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios" | "done">("hidden");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setMode("ios");
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); setMode("prompt"); };
    const onInstalled = () => setMode("done");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (mode === "hidden") return null;
  return (
    <section aria-labelledby="install-h" className="card p-4">
      <h2 id="install-h" className="text-lg font-bold">Install the FLAME PH app</h2>
      {mode === "done" && <p role="status" className="mt-1 text-sm">Installed. Open FLAME PH from your home screen.</p>}
      {mode === "prompt" && (
        <>
          <p className="mt-1 text-sm text-muted">Opens full screen from your home screen, loads faster, and shows a friendly page when you&apos;re offline. Free, no app store.</p>
          <button type="button" className="btn btn-primary mt-3 min-h-11" onClick={async () => { if (!evt) return; await evt.prompt(); const { outcome } = await evt.userChoice; setEvt(null); setMode(outcome === "accepted" ? "done" : "hidden"); }}>
            Install app
          </button>
        </>
      )}
      {mode === "ios" && <p className="mt-1 text-sm text-muted">On iPhone: tap the Share button <span aria-hidden>⎋</span> in Safari, then &quot;Add to Home Screen&quot;.</p>}
    </section>
  );
}
