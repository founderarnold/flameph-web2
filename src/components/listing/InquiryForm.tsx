"use client";
import { useEffect, useState } from "react";
import { Turnstile } from "@/components/Turnstile";

/** Sends an inquiry to the business owner's FLAME PH inbox (and email when set up). */
export function InquiryForm({ bizId, bizName, products, defaults }: { bizId: string; bizName: string; products: string[]; defaults: { name?: string; email?: string; mobile?: string } }) {
  const [product, setProduct] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);

  // "Inquire" buttons on product cards link to #inquire?product=…; pick that product up.
  useEffect(() => {
    const pick = () => {
      const m = window.location.hash.match(/^#inquire-(\d+)$/);
      if (!m) return;
      if (products[Number(m[1])]) setProduct(products[Number(m[1])]);
      document.getElementById("inquire")?.scrollIntoView({ behavior: "smooth" });
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, [products]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending"); setError(null);
    const res = await fetch("/api/inquiry", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bizId, product, name: fd.get("name"), email: fd.get("email"), mobile: fd.get("mobile"), message: fd.get("message"), website: fd.get("website"), turnstileToken }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setTurnstileReset((n) => n + 1);
    if (!res?.ok) { setState("idle"); setError(data?.error ?? "Hindi na-send. Please try again."); return; }
    setState("sent");
  }

  if (state === "sent") return (
    <div className="rounded-xl bg-ok-soft p-4 font-semibold text-ok" role="status">
      Sent! {bizName} will get back to you by email or mobile. Salamat!
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      {products.length > 0 && (
        <div>
          <label className="label" htmlFor="iq-product">Interested in</label>
          <select id="iq-product" className="input" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">General inquiry</option>{products.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      <div><label className="label" htmlFor="iq-name">Your name *</label><input id="iq-name" name="name" required maxLength={120} defaultValue={defaults.name} autoComplete="name" className="input" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="iq-email">Email</label><input id="iq-email" name="email" type="email" maxLength={200} defaultValue={defaults.email} autoComplete="email" className="input" /></div>
        <div><label className="label" htmlFor="iq-mobile">Mobile</label><input id="iq-mobile" name="mobile" type="tel" inputMode="tel" maxLength={20} defaultValue={defaults.mobile} placeholder="09XX XXX XXXX" autoComplete="tel" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="iq-msg">Message *</label><textarea id="iq-msg" name="message" required rows={4} maxLength={1500} className="input" placeholder="Hi! I'd like to ask about price, minimum order and delivery to my area." /></div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <p className="text-sm text-muted">Give an email or mobile number so they can reply. Only {bizName} sees your details.</p>
      <Turnstile action="inquiry" onToken={setTurnstileToken} resetKey={turnstileReset} />
      {error && <p role="alert" className="rounded-lg bg-warn-soft p-3 font-semibold text-warn">{error}</p>}
      <button className="btn btn-primary w-full sm:w-auto" disabled={state === "sending" || !turnstileToken}>{state === "sending" ? "Sending…" : "Send inquiry"}</button>
    </form>
  );
}
