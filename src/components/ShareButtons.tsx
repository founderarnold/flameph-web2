"use client";
import { useEffect, useState } from "react";

export function ShareButtons({ path, title }: { path: string; title: string }) {
  const [url, setUrl] = useState(`https://flameph.org${path}`);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}${path}`), [path]);
  const enc = encodeURIComponent(url);
  const fbAppId = process.env.NEXT_PUBLIC_FB_APP_ID;
  // Messenger web share needs an app id; without one, fall back to the mobile deep link.
  const messenger = fbAppId
    ? `https://www.facebook.com/dialog/send?app_id=${fbAppId}&link=${enc}&redirect_uri=${enc}`
    : `fb-messenger://share/?link=${enc}`;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Share this page">
      <span className="font-semibold text-muted">Share:</span>
      <a className="btn btn-outline min-h-11 px-3 py-1 text-sm" href={messenger} target="_blank" rel="noopener">Messenger</a>
      <a className="btn btn-outline min-h-11 px-3 py-1 text-sm" href={`viber://forward?text=${encodeURIComponent(`${title} ${url}`)}`}>Viber</a>
      <a className="btn btn-outline min-h-11 px-3 py-1 text-sm" href={`https://www.facebook.com/sharer/sharer.php?u=${enc}`} target="_blank" rel="noopener">Facebook</a>
      <button type="button" className="btn btn-ghost min-h-11 px-3 py-1 text-sm" onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); }}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
