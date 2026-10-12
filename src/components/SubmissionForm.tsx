"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormDef } from "@/lib/forms";

/** Renders any form from lib/forms. Drafts are saved locally so a dropped connection doesn't lose typing. */
export function SubmissionForm({ def, context, title, compact = false }: { def: FormDef; context?: Record<string, string>; title?: string; compact?: boolean }) {
  const key = `flameph-draft:${def.type}:${context?.event_id ?? ""}`;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null") as Record<string, string> | null;
      if (!saved || !formRef.current) return;
      for (const [k, v] of Object.entries(saved)) {
        const el = formRef.current.elements.namedItem(k) as HTMLInputElement | null;
        if (!el) continue;
        if (el.type === "checkbox") el.checked = v === "yes"; else el.value = v;
      }
    } catch { /* storage unavailable */ }
  }, [key]);

  const saveDraft = () => {
    if (!formRef.current) return;
    try {
      const data = Object.fromEntries(new FormData(formRef.current)) as Record<string, string>;
      delete data.website;
      localStorage.setItem(key, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending"); setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: def.type, data, context }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Hindi naipadala. Please try again.");
      try { localStorage.removeItem(key); } catch {}
      setState("done");
    } catch (err) {
      setState("error");
      setError(navigator.onLine === false ? "Mukhang offline ka. Your answers are saved on this phone — try again when you're back online." : (err as Error).message);
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="card border-ok/40 bg-ok-soft p-6">
        <p className="text-lg font-bold text-ok">Natanggap na namin! ✓</p>
        <p className="mt-1">{def.success}</p>
        <p className="mt-2 text-sm text-muted">A confirmation has been sent to your email.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onChange={saveDraft} className={`card space-y-4 ${compact ? "p-4" : "p-5 sm:p-6"}`} noValidate={false}>
      <h2 className="text-xl font-extrabold">{title ?? def.title}</h2>
      {def.intro && <p className="text-muted">{def.intro}</p>}
      {def.fields.map((f) => {
        const id = `${def.type}-${f.name}`;
        if (f.type === "checkbox") {
          return (
            <label key={f.name} htmlFor={id} className="flex items-start gap-2">
              <input id={id} name={f.name} type="checkbox" value="yes" required={f.required} className="mt-1 h-5 w-5 shrink-0" />
              <span>{f.label}{f.required && <span className="text-flame-strong"> *</span>}</span>
            </label>
          );
        }
        return (
          <div key={f.name}>
            <label htmlFor={id} className="label">{f.label}{f.required && <span className="text-flame-strong" aria-hidden> *</span>}</label>
            {f.type === "textarea" ? (
              <textarea id={id} name={f.name} required={f.required} placeholder={f.placeholder} rows={4} maxLength={4000} className="input" />
            ) : f.type === "select" ? (
              <select id={id} name={f.name} required={f.required} className="input" defaultValue="">
                <option value="" disabled>Pumili…</option>
                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input id={id} name={f.name} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder} maxLength={300}
                autoComplete={f.name === "email" ? "email" : f.name === "name" ? "name" : f.name === "mobile" ? "tel" : undefined}
                inputMode={f.type === "tel" ? "tel" : undefined} className="input" />
            )}
            {f.help && <p className="mt-1 text-sm text-muted">{f.help}</p>}
          </div>
        );
      })}
      {/* Honeypot: hidden from people, filled by bots */}
      <div className="hidden" aria-hidden><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-[15px]">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
        <span>I agree to the <Link href="/legal/privacy" className="underline">Privacy Notice</Link> and allow FLAME PH to process my information under the Data Privacy Act of 2012 (RA 10173).<span className="text-flame-strong"> *</span></span>
      </label>
      {state === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={state === "sending"}>{state === "sending" ? "Ipinapadala…" : def.submitLabel ?? "Submit"}</button>
    </form>
  );
}
