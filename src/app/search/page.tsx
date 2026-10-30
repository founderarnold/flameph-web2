import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { meta } from "@/lib/meta";
import { searchSite } from "@/lib/site-search";

export const metadata = meta("Search", "Search FLAME PH pages, programs, benefits and opportunities.", "/search");

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() ?? "";
  const results = searchSite(query, 50);

  return (
    <>
      <PageHero title="Search FLAME PH" fil="Hanapin ang kailangan mo" path="/search" share={false}
        intro="Search the FLAME PH website for programs, benefits, opportunities, chapters and support." />
      <Section>
        <form action="/search" role="search" className="flex max-w-2xl flex-col gap-3 sm:flex-row">
          <label htmlFor="search-page-input" className="sr-only">Search FLAME PH</label>
          <input id="search-page-input" name="q" type="search" defaultValue={query} placeholder="What are you looking for?" className="input min-w-0 flex-1" autoFocus />
          <button className="btn btn-primary">Search</button>
        </form>
        {query && (
          <div className="mt-8">
            <h2 className="text-xl font-extrabold">{results.length ? `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”` : `No results for “${query}”`}</h2>
            {results.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((result) => (
                  <Link key={result.href} href={result.href} className="card block p-5 hover:border-primary">
                    <span className="text-xs font-bold uppercase tracking-wide text-flame-strong">{result.section}</span>
                    <h3 className="mt-2 text-lg font-extrabold text-primary">{result.title}</h3>
                    <span className="mt-4 inline-flex font-bold text-mph">Open page →</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-muted">Try a broader term such as benefits, chapter, training, business, property or volunteer.</p>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
