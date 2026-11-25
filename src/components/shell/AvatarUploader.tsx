"use client";

import { useRef, useState } from "react";
import { saveAvatar } from "@/app/account/onboarding-actions";
import { Avatar } from "@/components/ui";
import { SUPABASE_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/browser";

const MAX = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const pub = (p: string | null) => (p ? `${SUPABASE_URL}/storage/v1/object/public/media/${p}` : null);

/**
 * Your photo, business logo or avatar, shown on your member card instead of your initials.
 * Uploaded to your own folder in the public media bucket; you can change or remove it anytime.
 */
export function AvatarUploader({ userId, name, current }: { userId: string; name: string; current: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!TYPES.includes(file.type)) return setMsg({ ok: false, text: "Please choose a JPG, PNG or WebP image." });
    if (file.size > MAX) return setMsg({ ok: false, text: "That image is too large (max 5 MB)." });
    const supabase = createClient();
    if (!supabase) return setMsg({ ok: false, text: "Uploads are not available right now." });
    setBusy(true);
    setMsg(null);
    try {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const p = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(p, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const res = await saveAvatar(p);
      if (!res.ok) throw new Error("save");
      setPath(p);
      setMsg({ ok: true, text: "Photo saved. It now shows on your member card." });
    } catch {
      setMsg({ ok: false, text: "Couldn't upload. Please try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await saveAvatar(null).catch(() => ({ ok: false }));
    setBusy(false);
    if (res.ok) { setPath(null); setMsg({ ok: true, text: "Photo removed. Your initials show instead." }); }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name || "Me"} src={pub(path)} size={72} />
      <div className="space-y-2">
        <p className="font-semibold">Photo, logo or avatar</p>
        <p className="text-sm text-muted">Shown on your member card instead of your initials.</p>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-outline min-h-11 cursor-pointer ${busy ? "opacity-60" : ""}`}>
            {busy ? "Uploading…" : path ? "Change photo" : "Add photo"}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={onFile} />
          </label>
          {path && <button type="button" className="btn min-h-11" onClick={remove} disabled={busy}>Remove</button>}
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
