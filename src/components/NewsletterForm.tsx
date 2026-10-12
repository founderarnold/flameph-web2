"use client";
import Link from "next/link";
import { useState } from "react";

export function NewsletterForm({ labels }: { labels: { subscribe: string; consent: string; sending: string } }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(fd)) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      setState("done"); setMsg(json.message);
    } catch (err) {
      setState("error"); setMsg((err as Error).message);
    }
  }
  if (state === "done") return <p role="status" className="mt-4 rounded-lg bg-ok-soft p-3 font-semibold text-ok">{msg}</p>;
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <label className="sr-only" htmlFor="nl-email">Email</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="nl-email" name="email" type="email" required autoComplete="email" placeholder="you@email.com" className="input" />
        <button className="btn btn-primary shrink-0" disabled={state === "sending"}>{state === "sending" ? labels.sending : labels.subscribe}</button>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
        <span>{labels.consent} <Link href="/legal/privacy" className="underline">Privacy Notice</Link></span>
      </label>
      {state === "error" && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{msg}</p>}
    </form>
  );
}
