"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { searchSite } from "@/lib/site-search";

export function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchSite(query, 6), [query]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!query.trim()) event.preventDefault();
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className="btn btn-ghost h-11 w-11 p-0"
        aria-label="Search FLAME PH"
        aria-expanded={open}
        aria-controls="site-search-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4.25 4.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div id="site-search-panel" className="card absolute right-0 top-[calc(100%+8px)] w-[min(88vw,24rem)] p-2 shadow-xl">
          <form action="/search" role="search" onSubmit={submit} className="flex gap-2">
            <label htmlFor="site-search-input" className="sr-only">Search within FLAME PH</label>
            <input
              ref={input}
              id="site-search-input"
              name="q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search FLAME PH…"
              autoComplete="off"
              className="input min-w-0 flex-1"
            />
            <button type="submit" className="btn btn-primary h-11 px-3" aria-label="Submit search">Search</button>
          </form>
          {query.trim() && (
            <div className="mt-2 border-t border-line pt-2">
              {results.length ? (
                <ul aria-label="Search suggestions">
                  {results.map((result) => (
                    <li key={result.href}>
                      <Link href={result.href} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-bg-soft">
                        <span className="font-semibold">{result.title}</span>
                        <span className="text-xs text-muted">{result.section}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-muted">No matching FLAME PH page yet.</p>
              )}
              <Link href={`/search?q=${encodeURIComponent(query.trim())}`} className="mt-1 flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-primary hover:bg-primary-soft">
                See all search results →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
