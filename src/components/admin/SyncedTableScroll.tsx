"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function SyncedTableScroll({ children, label }: { children: ReactNode; label: string }) {
  const topScroll = useRef<HTMLDivElement>(null);
  const topSpacer = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const top = topScroll.current;
    const spacer = topSpacer.current;
    const table = tableScroll.current;
    if (!top || !spacer || !table) return;

    const updateWidth = () => {
      spacer.style.width = `${table.scrollWidth}px`;
      top.scrollLeft = table.scrollLeft;
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    const content = table.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  const sync = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncing.current) return;
    syncing.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  const move = (amount: number) => {
    const table = tableScroll.current;
    if (!table) return;
    table.scrollBy({ left: amount, behavior: "smooth" });
    window.setTimeout(() => {
      if (topScroll.current) topScroll.current.scrollLeft = table.scrollLeft;
    }, 250);
  };

  return (
    <div className="hidden lg:block">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="admin-scroll-hint"><span aria-hidden="true">↔</span> Drag the blue scrollbar or use the buttons to see every column</p>
        <div className="flex gap-2" aria-label="Table horizontal scroll controls">
          <button type="button" className="btn btn-outline min-h-10 px-4 py-1 text-sm" onClick={() => move(-360)} aria-label="Scroll table left">← Left</button>
          <button type="button" className="btn btn-outline min-h-10 px-4 py-1 text-sm" onClick={() => move(360)} aria-label="Scroll table right">Right →</button>
        </div>
      </div>
      <div
        ref={topScroll}
        className="admin-table-scroll admin-table-scroll-top"
        onScroll={(event) => sync(event.currentTarget, tableScroll.current)}
        tabIndex={0}
        role="region"
        aria-label={`${label} top horizontal scrollbar`}
      >
        <div ref={topSpacer} className="h-px min-w-full" />
      </div>
      <div
        ref={tableScroll}
        className="admin-table-scroll card mt-2"
        onScroll={(event) => sync(event.currentTarget, topScroll.current)}
        tabIndex={0}
        role="region"
        aria-label={`${label}. Scroll horizontally to see all columns.`}
      >
        {children}
      </div>
    </div>
  );
}
