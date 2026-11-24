"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MULTI_SEPARATOR, type FormDef } from "@/lib/forms";
import { Turnstile } from "@/components/Turnstile";

/** Renders any form from lib/forms. Drafts are saved locally so a dropped connection doesn't lose typing. */
/** `defaults` pre-fills fields, e.g. the award picked on the home page (?award=). Only allowed option values are used. */
export function SubmissionForm({ def, context, title, compact = false, doneHref, defaults }: { def: FormDef; context?: Record<string, string>; title?: string; compact?: boolean; doneHref?: string; defaults?: Record<string, string> }) {
  const key = `flameph-draft:${def.type}:${context?.event_id ?? ""}`;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  // Answers that decide whether a follow-up field (showIf) is shown.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const readAnswers = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setAnswers(Object.fromEntries(def.fields.filter((f) => f.showIf).map((f) => [f.showIf!.field, String(fd.get(f.showIf!.field) ?? "")])));
  };
  const shown = (f: FormDef["fields"][number]) => !f.showIf || answers[f.showIf.field] === f.showIf.equals;
  const multiNames = def.fields.filter((f) => f.type === "multi").map((f) => f.name);
  const sectionCount = def.fields.filter((f) => f.section).length;
  /** Form values as strings; ticked "multi" options are joined with MULTI_SEPARATOR. */
  const collect = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const data = Object.fromEntries(fd) as Record<string, string>;
    for (const n of multiNames) {
      const all = fd.getAll(n).map(String);
      if (all.length) data[n] = all.join(MULTI_SEPARATOR); else delete data[n];
    }
    return data;
  };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null") as Record<string, string> | null;
      if (!saved || !formRef.current) return;
      for (const [k, v] of Object.entries(saved)) {
        if (multiNames.includes(k)) {
          const picked = String(v).split(MULTI_SEPARATOR);
          formRef.current.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${k}"]`).forEach((box) => { box.checked = picked.includes(box.value); });
          continue;
        }
        const el = formRef.current.elements.namedItem(k) as HTMLInputElement | null;
        if (!el) continue;
        if (el.type === "checkbox") el.checked = v === "yes"; else el.value = v;
      }
      readAnswers();
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const saveDraft = () => {
    if (!formRef.current) return;
    try {
      const data = collect(formRef.current);
      delete data.website;
      localStorage.setItem(key, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = collect(e.currentTarget);
    const missing = def.fields.find((f) => f.type === "multi" && f.required && shown(f) && !data[f.name]);
    if (missing) { setState("error"); setError(`Please tick at least one: ${missing.label}`); return; }
    setState("sending"); setError("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: def.type, data, context: { ...context, turnstileToken } }),
      });
      const json = await res.json().catch(() => ({}));
      setTurnstileReset((n) => n + 1);
      if (!res.ok) throw new Error(json.error || "Hindi naipadala. Please try again.");
      try { localStorage.removeItem(key); } catch {}
      setState("done");
    } catch (err) {
      setTurnstileReset((n) => n + 1);
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
        {doneHref && <Link href={doneHref} className="btn btn-primary mt-4 w-full">Back to feed</Link>}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onChange={() => { saveDraft(); readAnswers(); }} className={`card space-y-4 ${compact ? "p-4" : "p-5 sm:p-6"}`} noValidate={false}>
      <h2 className="text-xl font-extrabold">{title ?? def.title}</h2>
      {def.intro && <p className="text-muted">{def.intro}</p>}
      {def.fields.filter(shown).map((f) => {
        const id = `${def.type}-${f.name}`;
        const sectionIndex = f.section ? def.fields.filter((x) => x.section).indexOf(f) + 1 : 0;
        const heading = f.section ? (
          <h3 className={`text-lg font-extrabold ${sectionIndex > 1 ? "border-t border-line pt-5" : ""}`}>
            {sectionCount > 1 && <span className="block text-sm font-bold text-flame-strong">Step {sectionIndex} of {sectionCount}</span>}
            {f.section}
          </h3>
        ) : null;
        const optional = def.markOptional && !f.required && f.type !== "checkbox" ? <span className="font-normal text-muted"> (optional)</span> : null;
        const field = (() => {
        if (f.type === "multi") {
          return (
            <fieldset>
              <legend className="label">{f.label}{f.required ? <span className="text-flame-strong" aria-hidden> *</span> : optional}</legend>
              {f.help && <p className="mb-2 text-sm text-muted">{f.help}</p>}
              <div className="grid gap-x-3 sm:grid-cols-2">
                {f.options?.map((o, i) => (
                  <label key={o} htmlFor={`${id}-${i}`} className="flex min-h-[44px] items-center gap-2">
                    <input id={`${id}-${i}`} name={f.name} type="checkbox" value={o} className="h-5 w-5 shrink-0" />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (f.type === "checkbox") {
          return (
            <label htmlFor={id} className="flex items-start gap-2">
              <input id={id} name={f.name} type="checkbox" value="yes" required={f.required} className="mt-1 h-5 w-5 shrink-0" />
              <span>{f.label}{f.required && <span className="text-flame-strong"> *</span>}
                {f.link && <> <a href={f.link.href} target="_blank" rel="noopener" className="font-semibold text-primary underline">{f.link.text}<span className="sr-only"> (opens a new tab)</span></a></>}</span>
            </label>
          );
        }
        return (
          <div>
            <label htmlFor={id} className="label">{f.label}{f.required ? <span className="text-flame-strong" aria-hidden> *</span> : optional}</label>
            {f.type === "textarea" ? (
              <textarea id={id} name={f.name} required={f.required} placeholder={f.placeholder} rows={4} maxLength={4000} className="input" />
            ) : f.type === "select" ? (
              <select id={id} name={f.name} required={f.required} className="input" defaultValue={defaults?.[f.name] && f.options?.includes(defaults[f.name]) ? defaults[f.name] : ""}>
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
        })();
        return <div key={f.name} className="space-y-4">{heading}{field}</div>;
      })}
      {/* Honeypot: hidden from people, filled by bots */}
      <div className="hidden" aria-hidden><label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-[15px]">
        <input type="checkbox" name="consent" value="yes" required className="mt-1 h-5 w-5 shrink-0" />
        <span>I agree to the <Link href="/legal/privacy" className="underline">Privacy Notice</Link> and allow FLAME PH to process my information under the Data Privacy Act of 2012 (RA 10173).<span className="text-flame-strong"> *</span></span>
      </label>
      <Turnstile action="public_form" onToken={setTurnstileToken} resetKey={turnstileReset} />
      {state === "error" && <p role="alert" className="rounded-lg bg-red-50 p-3 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={state === "sending" || !turnstileToken}>{state === "sending" ? "Ipinapadala…" : def.submitLabel ?? "Submit"}</button>
    </form>
  );
}
