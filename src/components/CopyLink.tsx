"use client";
import { useState } from "react";

export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly value={url} aria-label="Your invite link" className="input min-w-0 flex-1 font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-primary" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } }}>
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
