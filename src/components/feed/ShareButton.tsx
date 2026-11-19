"use client";
import { useState } from "react";

/**
 * Share a post: the phone's share sheet (Messenger, Viber, SMS…) where there is one, otherwise copy the link.
 * text: for an investor/funder post, the full warning in English and Taglish travels with the link (and is copied with it).
 */
export function ShareButton({ path, title, text }: { path: string; title: string; text?: string }) {
  const [msg, setMsg] = useState("");
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) { await navigator.share(text ? { title, text, url } : { title, url }); return; }
      await navigator.clipboard.writeText(text ? `${text}\n\n${url}` : url);
      setMsg(text ? "Link copied with the investor warning. Only FLAME PH members can open it." : "Link copied. Only FLAME PH members can open it.");
    } catch {
      // The member closed the share sheet.
    }
  };
  return (
    <div className="relative">
      <button type="button" onClick={share} className="btn btn-ghost min-h-11 w-full flex-col gap-0 px-1 text-xs" aria-label={`Share: ${title}`}>
        <span aria-hidden className="text-base leading-none">↗</span><span aria-hidden>Share</span>
      </button>
      <span role="status" aria-live="polite" className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg bg-fg p-2 text-xs text-bg shadow empty:hidden">{msg}</span>
    </div>
  );
}
