"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { saveAvatar } from "@/app/account/onboarding-actions";
import { Avatar } from "@/components/ui";
import { SUPABASE_URL } from "@/lib/env";

const url = (p: string | null) => (p ? (p.startsWith("http") ? p : `${SUPABASE_URL}/storage/v1/object/public/media/${p}`) : null);
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photo shown on the member's card in place of their initials: their own photo or avatar, or their business logo.
 * Uploads go to the member's own folder of the public `media` bucket (max 5 MB, JPG, PNG or WebP).
 */
export function AvatarPicker({ userId, name, avatarPath, logoPath }: { userId: string; name: string; avatarPath: string | null; logoPath: string | null }) {
  const [path, setPath] = useState(avatarPath);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const shown = url(path) ?? url(logoPath);

  async function save(next: string | null, okText: string) {
    const res = await saveAvatar(next).catch(() => ({ ok: false }));
    if (res.ok) { setPath(next); setMsg({ ok: true, text: okText }); }
    else setMsg({ ok: false, text: "That didn't save. Please try again in a moment." });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return setMsg({ ok: false, text: "Please choose a JPG, PNG or WebP photo." });
    if (file.size > 5 * 1024 * 1024) return setMsg({ ok: false, text: "Photo too large (max 5 MB)." });
    const supabase = createClient();
    if (!supabase) return;
    setBusy(true); setMsg(null);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const p = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(p, file, { contentType: file.type, upsert: false });
    if (error) { setBusy(false); return setMsg({ ok: false, text: "Upload failed. Please check your connection and try again." }); }
    await save(p, "Photo saved. Members now see it on your card.");
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name || "Member"} src={shown} size={72} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-muted">Your photo, avatar or business logo shows on your member card instead of your initials.</p>
        <div className="flex flex-wrap gap-2">
          <label className={`btn btn-outline min-h-11 cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy ? "Uploading…" : path ? "Change photo" : "Upload photo or logo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={busy} />
          </label>
          {path && <button type="button" className="btn btn-ghost min-h-11" disabled={busy}
            onClick={() => save(null, logoPath ? "Your business logo shows on your card now." : "Photo removed.")}>
            {logoPath ? "Use my business logo" : "Remove photo"}</button>}
        </div>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
