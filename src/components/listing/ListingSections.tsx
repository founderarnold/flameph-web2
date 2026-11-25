"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { HASH_SECTIONS, type SectionKey, type StepKey } from "@/lib/listing-sections";

/** The address of one part of My business listing, keeping any other choices in the address (like a RideSafe sign-up). */
export const sectionHref = (key: SectionKey, query = "") => `/account/business?${[query, `section=${key}`].filter(Boolean).join("&")}`;

/** Opens a step without reloading, and scrolls back up to the step list so the member sees where they are. */
export function useGoToSection(query = "") {
  const router = useRouter();
  return (key: SectionKey) => {
    router.push(sectionHref(key, query), { scroll: false });
    requestAnimationFrame(() => document.getElementById("listing-sections")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
}

type Item = { key: StepKey; title: string; blurb: string; done: boolean };

/**
 * "Your listing in 6 steps" at the top of My business listing: tap any step to open it, in any order. A tick means the
 * step has everything it needs; the others can be skipped now and finished later.
 */
export function StepList({ items, current, query = "", explicit, points, published }: { items: Item[]; current: SectionKey; query?: string; explicit: boolean; points: number; published: boolean }) {
  const go = useGoToSection(query);
  const router = useRouter();
  const done = items.filter((i) => i.done).length;
  const index = items.findIndex((i) => i.key === current);
  // Old links such as /account/business#products open the matching step.
  useEffect(() => {
    const key = HASH_SECTIONS[window.location.hash.slice(1)];
    if (!explicit && key && key !== current) router.replace(sectionHref(key, query), { scroll: false });
  }, [explicit, current, query, router]);
  const open = (key: SectionKey) => (e: React.MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(key); };
  return (
    <nav id="listing-sections" aria-label="Listing steps" className="card mt-6 scroll-mt-24 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">Your listing in 6 steps</p>
        <p className="text-sm font-semibold text-muted">{done} of {items.length} done</p>
      </div>
      <div role="progressbar" aria-label="Steps done" aria-valuenow={done} aria-valuemin={0} aria-valuemax={items.length} className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-flame" style={{ width: `${Math.max((done / items.length) * 100, 3)}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">Each step earns {points} points. Skip anything you don&apos;t have yet: what you save stays saved. {published ? "Your listing is live; changes you save show right away." : "Saving step 6 publishes your listing automatically once the needed items are in."}</p>
      <ol className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {items.map((s, i) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="min-w-0">
              <a href={sectionHref(s.key, query)} aria-current={on ? "step" : undefined} onClick={open(s.key)}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-2 py-2 text-[13px] leading-tight sm:px-3 sm:text-sm ${on ? "border-primary bg-primary-soft font-bold text-primary" : "border-line hover:bg-bg-soft"}`}>
                <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-ok text-white" : on ? "bg-primary text-white" : "bg-bg-soft text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                <span className="min-w-0">{s.title}<span className="sr-only">{s.done ? ", done" : ", not done yet"}</span></span>
              </a>
            </li>
          );
        })}
      </ol>
      {index >= 0 ? (
        <p className="mt-3 text-sm"><strong>Step {index + 1} of {items.length}: {items[index].title}.</strong> <span className="text-muted">{items[index].blurb}.</span></p>
      ) : (
        <p className="mt-3 text-sm"><a href={sectionHref("publish", query)} onClick={open("publish")} className="font-bold text-primary underline">See publish status and checks</a></p>
      )}
    </nav>
  );
}

/** Back to the 6 steps, for the Level up pages (More details, Mini-website, MarketplacePH store, Publish status). */
export function BackToSteps({ to, query = "" }: { to: StepKey; query?: string }) {
  const go = useGoToSection(query);
  return <button type="button" onClick={() => go(to)} className="btn btn-ghost mt-3">← Back to the 6 steps</button>;
}

/** A link that opens a part of My business listing without reloading. */
export function SectionLink({ to, query = "", className, children }: { to: SectionKey; query?: string; className?: string; children: React.ReactNode }) {
  const go = useGoToSection(query);
  return <a href={sectionHref(to, query)} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(to); }} className={className}>{children}</a>;
}
