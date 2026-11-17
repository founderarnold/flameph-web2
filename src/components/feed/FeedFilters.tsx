import Link from "next/link";
import { INDUSTRY_NAMES } from "@/lib/industries";

/** Industry, chapter and "people I follow" filters. A plain GET form: the address can be shared and Back works. */
export function FeedFilters({ industry, chapter, following, chapters, myChapter }: {
  industry: string | null; chapter: string | null; following: boolean; chapters: { id: string; name: string }[]; myChapter?: string | null;
}) {
  const active = Boolean(industry || chapter || following);
  return (
    <details className="card p-3" open={active}>
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold">
        <span>Filter the feed{active && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">On</span>}</span>
        <span aria-hidden className="text-muted">▾</span>
      </summary>
      <form action="/home" className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="f-industry" className="label text-sm">Industry</label>
          <select id="f-industry" name="industry" defaultValue={industry ?? ""} className="input min-h-11 w-full">
            <option value="">All industries</option>
            {INDUSTRY_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-chapter" className="label text-sm">Chapter</label>
          <select id="f-chapter" name="chapter" defaultValue={chapter ?? ""} className="input min-h-11 w-full">
            <option value="">All chapters</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === myChapter ? " (yours)" : ""}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="f-who" className="label text-sm">Posts from</label>
          <select id="f-who" name="who" defaultValue={following ? "following" : ""} className="input min-h-11 w-full">
            <option value="">Everyone</option>
            <option value="following">People I follow</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button className="btn btn-primary min-h-11">Show</button>
          {active && <Link href="/home" className="btn btn-outline min-h-11">Clear filters</Link>}
        </div>
      </form>
    </details>
  );
}
