"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HASH_SECTIONS, neighbour, type SectionKey } from "@/lib/listing-sections";

/** The address of one section of My business listing, keeping any other choices in the address (like a RideSafe sign-up). */
export const sectionHref = (key: SectionKey, query = "") => `/account/business?${[query, `section=${key}`].filter(Boolean).join("&")}`;

/** Opens a section without reloading, and scrolls back up to the section list so the member sees where they are. */
export function useGoToSection(query = "") {
  const router = useRouter();
  return (key: SectionKey) => {
    router.push(sectionHref(key, query), { scroll: false });
    requestAnimationFrame(() => document.getElementById("listing-sections")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
}

type Item = { key: SectionKey; title: string; blurb: string; done: boolean };

/**
 * The list of sections at the top of My business listing: tap any one to open it, in any order. A tick means the
 * section has everything it needs; the others can be skipped now and finished later.
 */
export function SectionList({ items, current, query = "", explicit }: { items: Item[]; current: SectionKey; query?: string; explicit: boolean }) {
  const go = useGoToSection(query);
  const router = useRouter();
  const done = items.filter((i) => i.done).length;
  const index = items.findIndex((i) => i.key === current);
  // Old links such as /account/business#products open the matching section.
  useEffect(() => {
    const key = HASH_SECTIONS[window.location.hash.slice(1)];
    if (!explicit && key && key !== current) router.replace(sectionHref(key, query), { scroll: false });
  }, [explicit, current, query, router]);
  return (
    <nav id="listing-sections" aria-label="Listing sections" className="card mt-6 scroll-mt-24 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">Fill in one section at a time</p>
        <p className="text-sm font-semibold text-muted">{done} of {items.length} done</p>
      </div>
      <div role="progressbar" aria-label="Sections done" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-flame" style={{ width: `${Math.max((done / items.length) * 100, 3)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">Skip anything you don&apos;t have yet. What you save stays saved, so you can come back any time to finish.</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {items.map((s, i) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="min-w-0">
              <a href={sectionHref(s.key, query)} aria-current={on ? "step" : undefined}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(s.key); }}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-2 py-2 text-[13px] leading-tight sm:px-3 sm:text-sm ${on ? "border-primary bg-primary-soft font-bold text-primary" : "border-line hover:bg-bg-soft"}`}>
                <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-ok text-white" : on ? "bg-primary text-white" : "bg-bg-soft text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                <span className="min-w-0">{s.title}<span className="sr-only">{s.done ? ", done" : ", not done yet"}</span></span>
              </a>
            </li>
          );
        })}
      </ol>
      {index >= 0 && <p className="mt-3 text-sm"><strong>Section {index + 1} of {items.length}: {items[index].title}.</strong> <span className="text-muted">{items[index].blurb}.</span></p>}
    </nav>
  );
}

/** Back, Skip for now and Next for the sections that have their own save button (More details, Mini-website). */
export function SectionPager({ current, query = "" }: { current: SectionKey; query?: string }) {
  const go = useGoToSection(query);
  const prev = neighbour(current, -1);
  const next = neighbour(current, 1);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {prev && <button type="button" onClick={() => go(prev)} className="btn btn-ghost">← Back</button>}
      {next && <button type="button" onClick={() => go(next)} className="btn btn-outline ml-auto">Next section →</button>}
    </div>
  );
}
