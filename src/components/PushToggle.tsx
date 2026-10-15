"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function toKey(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Lets a member turn on phone or desktop notifications for new inquiries and weekly picks. */
export function PushToggle({ userId }: { userId: string }) {
  const [state, setState] = useState<"loading" | "unsupported" | "off" | "on" | "blocked" | "busy">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.getRegistration("/push-sw.js").then(async (r) => setState((await r?.pushManager.getSubscription()) ? "on" : "off")).catch(() => setState("off"));
  }, []);

  async function turnOn() {
    setState("busy"); setError("");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(KEY!) });
      const j = sub.toJSON();
      const { error: e } = await createClient()!.from("push_subscriptions").upsert({ endpoint: sub.endpoint, user_id: userId, p256dh: j.keys!.p256dh, auth: j.keys!.auth }, { onConflict: "endpoint" });
      if (e) throw e;
      setState("on");
    } catch {
      setError("Couldn't turn on notifications on this device. Please try again.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await createClient()?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  }

  if (state === "unsupported" || state === "loading") return null;
  return (
    <div className="card p-5">
      <h2 className="text-lg font-bold">Notifications</h2>
      <p className="mt-1 text-muted">{state === "on" ? "On for this device. We'll tell you about new inquiries and weekly opportunities." : state === "blocked" ? "Notifications are blocked for flameph.org in this browser's settings." : "Get a notification on this phone or computer when a buyer sends an inquiry."}</p>
      {state !== "blocked" && (
        <button type="button" onClick={state === "on" ? turnOff : turnOn} disabled={state === "busy"} className={`btn mt-3 ${state === "on" ? "btn-outline" : "btn-primary"}`}>
          {state === "busy" ? "Please wait…" : state === "on" ? "Turn off on this device" : "Turn on notifications"}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-warn">{error}</p>}
    </div>
  );
}
