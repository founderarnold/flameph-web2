"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { viaGo } from "@/lib/ecosystem";
import { CREATE_ACTIONS } from "@/lib/mobile-menu";
import { useDialog } from "./useDialog";

/**
 * Create (+) on the members' bottom bar: a sheet of things a member can start, each opening an existing page
 * (the page checks sign-in and permissions itself). `trigger` is the tab button.
 */
export function CreateSheet({ trigger }: { trigger: (open: () => void, isOpen: boolean) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const { close, linkClick } = useDialog({ open, setOpen, panel, key: "flCreate" });
  return (
    <>
      {trigger(() => setOpen(true), open)}
      {open && createPortal(
        <div id="create-sheet" role="dialog" aria-modal="true" aria-labelledby="create-sheet-title" data-shell="create" className="fixed inset-0 z-50 flex items-end">
          <button type="button" tabIndex={-1} aria-hidden onClick={close} className="absolute inset-0 cursor-default bg-black/40" />
          <div ref={panel} className="relative max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-bg px-4 pt-3 shadow-xl" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between gap-3">
              <h2 id="create-sheet-title" className="font-display text-lg font-extrabold text-primary">Create</h2>
              <button type="button" onClick={close} data-autofocus className="btn btn-outline h-12 w-12 p-0" aria-label="Close Create">
                <svg aria-hidden width="24" height="24" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <ul role="list" className="mt-2 divide-y divide-line">
              {CREATE_ACTIONS.map((a) => {
                const href = a.external ? viaGo(a.href, a.label) : a.href;
                return (
                  <li key={a.label}>
                    <Link href={href} onClick={linkClick(href)} className="flex min-h-14 flex-col justify-center gap-0.5 rounded-lg px-2 py-2 hover:bg-bg-soft">
                      <span className="font-bold">{a.label}</span>
                      <span className="text-sm text-muted">{a.text}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
