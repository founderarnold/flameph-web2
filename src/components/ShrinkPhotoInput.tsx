"use client";
import { useState } from "react";

/**
 * A file picker for private documents. Photos (JPG, PNG, WEBP, and HEIC where the phone can read it) are made smaller
 * in the phone before upload: at most `maxSide` pixels on the long side, saved as JPG. That keeps uploads fast on
 * mobile data and well under the size limit. PDFs are sent as they are, and anything over the limit is stopped here
 * with a plain message. Without JavaScript it is an ordinary file input and the server still checks everything.
 */
export function ShrinkPhotoInput({ id, name = "file", maxBytes, maxSide = 1600, required = true }: { id: string; name?: string; maxBytes: number; maxSide?: number; required?: boolean }) {
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const mb = (n: number) => `${(n / 1048576).toFixed(n < 1048576 ? 2 : 1)} MB`;

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    setNote(null);
    if (!f) return;
    if (f.type.startsWith("image/") && f.type !== "image/gif") {
      try {
        const bmp = await createImageBitmap(f);
        const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        if (scale < 1 || f.size > 700 * 1024 || !/^image\/(jpeg|png|webp)$/.test(f.type)) {
          const c = document.createElement("canvas");
          c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
          const g = c.getContext("2d");
          if (g) {
            g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // PNG with see-through parts: white paper, not black
            g.drawImage(bmp, 0, 0, c.width, c.height);
            const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
            if (blob && blob.size < f.size) {
              const small = new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
              const dt = new DataTransfer(); dt.items.add(small); input.files = dt.files;
              setNote({ ok: true, text: `Photo made smaller for upload: ${mb(f.size)} → ${mb(small.size)}.` });
              return;
            }
          }
        }
      } catch { /* the phone can't read this photo type; the server checks it */ }
    }
    if (f.size > maxBytes) {
      input.value = "";
      setNote({ ok: false, text: `This file is ${mb(f.size)}. The limit is ${mb(maxBytes)}. Take a photo of the document instead, or save the PDF smaller.` });
    }
  }

  return (
    <>
      <input id={id} name={name} type="file" required={required} accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={onChange} className="block min-h-11 w-full text-sm" aria-describedby={`${id}-note`} />
      <p id={`${id}-note`} role="status" className={`mt-1 text-xs ${note ? (note.ok ? "text-ok" : "font-semibold text-danger") : "text-muted"}`}>
        {note ? note.text : `PDF or photo, up to ${mb(maxBytes)}. Photos are made smaller on your phone before sending.`}
      </p>
    </>
  );
}
