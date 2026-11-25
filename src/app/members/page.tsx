import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { INDUSTRY_NAMES } from "@/lib/industries";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { followingIds, peopleCards, type Suggestion, type SuggestedBiz } from "@/lib/suggestions";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";
import { REGIONS, filterDirectory, filtersQuery, readFilters } from "@/lib/directory-search";

export const metadata = { title: "Find members", robots: { index: false } };

type Row = SuggestedBiz & { region?: string | null; subsector?: string | null };

/** Members only: the member business directory. Search by name or place, filter by industry, chapter and region. */
export default async function Members({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/members");
  const [rows, following, { data: chapterRows }, { data: siteRows }] = await Promise.all([
    list<Row>({ table: "businesses", select: "*", filters: PUBLIC_BUSINESS_FILTERS, order: "created_at", limit: 500 }),
    followingIds(supabase, user.id),
    supabase.from("chapters").select("id, name").eq("published", true).order("name").limit(200),
    // Members with a published mini-website (FlamePH Pages). Empty until database update 0020.
    supabase.from("member_minisites").select("owner_id").eq("published", true).limit(2000),
  ]);
  const chapters = (chapterRows ?? []) as { id: string; name: string }[];
  const withMinisite = new Set(((siteRows ?? []) as { owner_id: string }[]).map((s) => s.owner_id));
  const f = readFilters(sp, chapters.map((c) => c.id));
  const shown = filterDirectory(rows.filter((b) => b.owner_id !== user.id), f, withMinisite);
  const back = `/members${filtersQuery(f)}`;
  const filtered = Boolean(f.q || f.industry || f.chapter || f.region || f.minisite);
  // Photo, business name, followers and verified badge for the members on this page (falls back to the listing card).
  const rich = new Map((await peopleCards(supabase, shown.slice(0, 60).map((b) => ({ user_id: b.owner_id })))).map((c) => [c.owner_id, c]));
  const card = (b: Row): Suggestion => { const c = rich.get(b.owner_id); return c ? { ...b, ...c, id: b.id, slug: b.slug ?? c.slug, sector: b.sector ?? c.sector } : b; };
  return (
    <div className="container-x py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Find members</h1>
        <p className="text-muted">The FLAME PH member directory. Follow members to see their updates in your feed. You follow {following.size}.</p>
        <form role="search" className="grid gap-2 sm:grid-cols-2">
          <label htmlFor="mq" className="sr-only">Name or place</label>
          <input id="mq" name="q" defaultValue={f.q} placeholder="Name, city or province" className="input min-h-11 sm:col-span-2" />
          <label htmlFor="mi" className="sr-only">Industry</label>
          <select id="mi" name="industry" defaultValue={f.industry} className="input min-h-11"><option value="">All industries</option>{INDUSTRY_NAMES.map((x) => <option key={x}>{x}</option>)}</select>
          <label htmlFor="mc" className="sr-only">Chapter</label>
          <select id="mc" name="chapter" defaultValue={f.chapter} className="input min-h-11"><option value="">All chapters</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label htmlFor="mr" className="sr-only">Region</label>
          <select id="mr" name="region" defaultValue={f.region} className="input min-h-11"><option value="">All regions</option>{REGIONS.map((x) => <option key={x}>{x}</option>)}</select>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="minisite" value="1" defaultChecked={f.minisite} className="h-5 w-5" /> Has a mini-website</label>
          <button className="btn btn-primary min-h-11 sm:col-span-2">Search</button>
        </form>
        <p className="text-sm text-muted" role="status">{shown.length} {shown.length === 1 ? "member" : "members"}{filtered && <> · <Link href="/members" className="underline">Clear filters</Link></>}</p>
        {shown.length === 0 ? <p className="text-muted">No members match. <Link href="/members" className="underline">Show all</Link></p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.slice(0, 60).map((b) => <li key={b.id}><SuggestedMemberCard b={card(b)} following={following.has(b.owner_id)} back={back} minisite={withMinisite.has(b.owner_id)} /></li>)}
          </ul>
        )}
        {shown.length > 60 && <p className="text-sm text-muted">Showing the first 60. Add a filter to narrow it down.</p>}
        <p className="text-sm text-muted">Looking for the public list of mini-websites? <a href="https://pages.flameph.org/directory" className="font-semibold underline">Open the Pages directory</a>.</p>
      </div>
    </div>
  );
}
