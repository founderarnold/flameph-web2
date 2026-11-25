import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { INDUSTRIES, INDUSTRY_NAMES } from "@/lib/industries";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { findMembers, followingIds, withCardDetails, type SuggestedBiz } from "@/lib/suggestions";
import { REGION_OF } from "@/content/ph-regions";
import { FollowCount, FollowCountProvider } from "@/components/shell/FollowButton";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";
import { REGIONS, filterDirectory, filtersQuery, readFilters } from "@/lib/directory-search";
import { regionOf as regionOfProvince } from "@/content/ph-regions";

export const metadata = { title: "Find members", robots: { index: false } };

type Row = SuggestedBiz & { region?: string | null; subsector?: string | null; verified?: boolean };

const PER_PAGE = 30;

/**
 * Members only: find members. Lists every active member (find_members, 0041), most relevant to the viewer first, even
 * with nothing typed. Search by name, business or place; filter by industry, category, chapter, region, Verified and
 * mini-website. Before 0041 it falls back to published listings only.
 */
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
  const { data: me } = await supabase.from("profiles").select("city, province, industries, chapter_id").eq("id", user.id).maybeSingle();
  const chapters = (chapterRows ?? []) as { id: string; name: string }[];
  const withMinisite = new Set(((siteRows ?? []) as { owner_id: string }[]).map((s) => s.owner_id));
  const f = readFilters(sp, chapters.map((c) => c.id));
  const page = Math.min(Math.max(Number.parseInt(sp.page ?? "0", 10) || 0, 0), 50);
  const regionProvinces = f.region ? Object.entries(REGION_OF).filter(([, r]) => r === f.region).map(([p]) => p) : [];
  const found = await findMembers(supabase, { q: f.q, industry: f.industry, category: f.category ?? "", provinces: regionProvinces, city: "",
    chapter: f.chapter, verified: Boolean(f.verified), minisite: f.minisite }, page, PER_PAGE);
  // Fallback before the 0041 update: published listings only.
  const legacy = found ? [] : filterDirectory(rows.filter((b) => b.owner_id !== user.id), f, withMinisite);
  const total = found ? found.total : legacy.length;
  const cards = found ? await withCardDetails(supabase, found.cards)
    : await withCardDetails(supabase, legacy.slice(0, 60).map((b) => ({ ...b, business_name: b.name, sector: b.subsector || b.sector })));
  const back = `/members${filtersQuery(f)}`;
  const filtered = Boolean(f.q || f.industry || f.chapter || f.region || f.minisite || f.category || f.verified);
  const pageHref = (n: number) => { const q = new URLSearchParams(filtersQuery(f).slice(1)); if (n) q.set("page", String(n)); const t = q.toString(); return `/members${t ? `?${t}` : ""}`; };
  const quick = [
    me?.city || me?.province ? { label: "Near me", href: `/members?q=${encodeURIComponent((me.city || me.province) as string)}` } : null,
    me?.province && regionOfProvince(me.province) ? { label: "My region", href: `/members?region=${encodeURIComponent(regionOfProvince(me.province)!)}` } : null,
    ...((me?.industries as string[] | null) ?? []).slice(0, 3).map((i) => ({ label: i, href: `/members?industry=${encodeURIComponent(i)}` })),
    me?.chapter_id && chapters.some((c) => c.id === me.chapter_id) ? { label: "My chapter", href: `/members?chapter=${me.chapter_id}` } : null,
    { label: "✓ Verified", href: "/members?verified=1" },
  ].filter(Boolean) as { label: string; href: string }[];
  return (
    <div className="container-x py-6">
      <FollowCountProvider initial={following.size}>
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Find members</h1>
        <p className="text-muted">The FLAME PH member directory. Follow members to see their updates in your feed. You follow <FollowCount fallback={following.size} />.</p>
        {quick.length > 0 && (
          <nav aria-label="Quick picks" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <span className="shrink-0 self-center text-sm font-semibold text-muted">For you:</span>
            {quick.map((c) => <Link key={c.href} href={c.href} className="chip min-h-11 shrink-0 content-center">{c.label}</Link>)}
          </nav>
        )}
        <form role="search" className="grid gap-2 sm:grid-cols-2">
          <label htmlFor="mq" className="sr-only">Name or place</label>
          <input id="mq" name="q" defaultValue={f.q} placeholder="Name, business, city or province (optional)" className="input min-h-11 sm:col-span-2" />
          <label htmlFor="mi" className="sr-only">Industry</label>
          <select id="mi" name="industry" defaultValue={f.industry} className="input min-h-11"><option value="">All industries</option>{INDUSTRY_NAMES.map((x) => <option key={x}>{x}</option>)}</select>
          <label htmlFor="mc" className="sr-only">Chapter</label>
          <select id="mc" name="chapter" defaultValue={f.chapter} className="input min-h-11"><option value="">All chapters</option>{chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label htmlFor="mr" className="sr-only">Region</label>
          <select id="mr" name="region" defaultValue={f.region} className="input min-h-11"><option value="">All regions</option>{REGIONS.map((x) => <option key={x}>{x}</option>)}</select>
          <label htmlFor="mcat" className="sr-only">Business category</label>
          <select id="mcat" name="category" defaultValue={f.category} className="input min-h-11">
            <option value="">All business categories</option>
            {INDUSTRIES.filter((i) => i.subs.length).map((i) => <optgroup key={i.name} label={i.name}>{i.subs.map((x) => <option key={x}>{x}</option>)}</optgroup>)}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="verified" value="1" defaultChecked={f.verified} className="h-5 w-5" /> Verified businesses only</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="minisite" value="1" defaultChecked={f.minisite} className="h-5 w-5" /> Has a mini-website</label>
          <button className="btn btn-primary min-h-11 sm:col-span-2">Search</button>
        </form>
        <p className="text-sm text-muted" role="status">{total} {total === 1 ? "member" : "members"}{!filtered && total > 0 && " · most relevant to you first"}{filtered && <> · <Link href="/members" className="underline">Clear filters</Link></>}</p>
        {cards.length === 0 ? <p className="text-muted">{filtered ? <>No members match these filters. <Link href="/members" className="underline">Show all members</Link></> : "No other members yet. Invite people to join FLAME PH."}</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map((b) => <li key={b.id} className="min-w-0"><SuggestedMemberCard b={b} following={following.has(b.owner_id)} back={back} minisite={withMinisite.has(b.owner_id)} /></li>)}
          </ul>
        )}
        {found && (page > 0 || (page + 1) * PER_PAGE < total) && (
          <nav aria-label="More members" className="flex justify-between gap-2">
            {page > 0 ? <Link href={pageHref(page - 1)} className="btn btn-outline min-h-11">Previous</Link> : <span />}
            {(page + 1) * PER_PAGE < total && <Link href={pageHref(page + 1)} className="btn btn-primary min-h-11">Show more members</Link>}
          </nav>
        )}
        {!found && total > 60 && <p className="text-sm text-muted">Showing the first 60. Add a filter to narrow it down.</p>}
        <p className="text-sm text-muted">Looking for the public list of mini-websites? <a href="https://pages.flameph.org/directory" className="font-semibold underline">Open the Pages directory</a>.</p>
      </div>
      </FollowCountProvider>
    </div>
  );
}
