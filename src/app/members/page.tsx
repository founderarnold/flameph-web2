import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { INDUSTRY_NAMES } from "@/lib/industries";
import { list } from "@/lib/content";
import { PUBLIC_BUSINESS_FILTERS } from "@/lib/public-business";
import { followingIds, type SuggestedBiz } from "@/lib/suggestions";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";

export const metadata = { title: "Find members", robots: { index: false } };

/** Members only: browse listed MSMEs by industry or place, open their profile and follow them. */
export default async function Members({ searchParams }: { searchParams: Promise<{ q?: string; industry?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/members");
  const q = (sp.q ?? "").toLowerCase().trim().slice(0, 60);
  const industry = INDUSTRY_NAMES.includes(sp.industry ?? "") ? sp.industry! : "";
  const [rows, following] = await Promise.all([
    list<SuggestedBiz>({ table: "businesses", select: "*", filters: PUBLIC_BUSINESS_FILTERS, order: "created_at", limit: 500 }),
    followingIds(supabase, user.id),
  ]);
  const shown = rows.filter((b) => b.owner_id !== user.id && (!industry || b.sector === industry) && (!q || `${b.name} ${b.city} ${b.province}`.toLowerCase().includes(q)));
  const back = `/members${industry || q ? `?${new URLSearchParams({ ...(industry ? { industry } : {}), ...(q ? { q } : {}) })}` : ""}`;
  return (
    <div className="container-x py-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-2xl font-extrabold sm:text-3xl">Find members</h1>
        <p className="text-muted">MSMEs listed on FLAME PH. Follow them to see their updates in your feed. You follow {following.size}.</p>
        <form role="search" className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label htmlFor="mq" className="sr-only">Name or place</label>
          <input id="mq" name="q" defaultValue={sp.q ?? ""} placeholder="Name, city or province" className="input" />
          <label htmlFor="mi" className="sr-only">Industry</label>
          <select id="mi" name="industry" defaultValue={industry} className="input"><option value="">All industries</option>{INDUSTRY_NAMES.map((x) => <option key={x}>{x}</option>)}</select>
          <button className="btn btn-primary">Search</button>
        </form>
        {shown.length === 0 ? <p className="text-muted">No members match. <Link href="/members" className="underline">Show all</Link></p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.slice(0, 60).map((b) => <li key={b.id}><SuggestedMemberCard b={b} following={following.has(b.owner_id)} back={back} /></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
