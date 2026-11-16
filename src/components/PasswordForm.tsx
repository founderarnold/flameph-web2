"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function PasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password.length > 72) return setMsg({ ok: false, text: "Use 8 to 72 characters." });
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: /different|same/i.test(error.message) ? "That's already your password." : "Hindi na-save. Please try again." });
    setMsg({ ok: true, text: "Saved! Taking you to your account…" });
    setTimeout(() => router.replace("/account"), 1200);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label htmlFor="np" className="label">New password</label>
        <div className="flex gap-2">
          <input id="np" type={show ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          <button type="button" className="btn btn-ghost shrink-0" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>
        </div>
        <p className="mt-1 text-sm text-muted">8 to 72 characters.</p>
      </div>
      {msg && <p role="status" className={msg.ok ? "rounded-lg bg-ok-soft p-3 text-ok" : "font-semibold text-red-700 dark:text-red-300"}>{msg.text}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  );
}
