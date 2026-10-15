import Link from "next/link";
import { PageHero, Section, EmptyState } from "@/components/ui";
import { meta } from "@/lib/meta";
import { MemberNav } from "@/components/MemberNav";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SECTORS } from "@/app/directory/page";
import { PROVINCES } from "@/content/ph-provinces";
import { OPPORTUNITY_KINDS, STAGES, STAGE_KEYS, type Opportunity, dateLabel, matches, notExpired } from "@/lib/growth";

export const metadata = meta("Opportunities for MSMEs", "Grants, loans, trade fairs, bazaars, trainings and buyer requests for Filipino MSMEs, posted by FLAME PH.", "/opportunities");

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; province?: string; sector?: string; stage?: string; mine?: string }> }) {
  const sp = await searchParams;
  const { supabase: session, user } = await getSession();
  const db = session ?? (await createClient());
  const [{ data, error }, profile, biz] = await Promise.all([
    db ? db.from("opportunities").select("*").eq("published", true).order("deadline", { ascending: true, nullsFirst: false }).limit(300) : Promise.resolve({ data: [], error: null }),
    user && session ? session.from("profiles").select("province, business_stage").eq("id", user.id).single() : null,
    user && session ? session.from("businesses").select("sector, province").eq("owner_id", user.id).limit(1).maybeSingle() : null,
  ]);
  const me = { province: biz?.data?.province ?? profile?.data?.province, sector: biz?.data?.sector, stage: profile?.data?.business_stage };
  const mine = Boolean(user) && sp.mine === "1";
  const all = ((error ? [] : data) ?? []) as Opportunity[];
  const rows = all.filter((o) => notExpired(o.deadline)
    && (!sp.kind || o.kind === sp.kind)
    && (!sp.province || !o.province || o.province === sp.province)
    && (!sp.sector || !o.sectors?.length || o.sectors.includes(sp.sector))
    && (!sp.stage || !o.stages?.length || o.stages.includes(sp.stage))
    && (!mine || sp.kind || sp.province || sp.sector || sp.stage || matches(o, me)));

  return (
    <>
      <MemberNav />
      <PageHero status="live" fil="Mga oportunidad para sa negosyo" title="Opportunities" path="/opportunities"
        intro="Grants, financing, trade fairs, bazaars, trainings and buyer requests that FLAME PH has checked. Always confirm details with the organizer before you apply." />
      <Section>
        {user ? (
          <p className="mb-4 text-muted">
            {mine ? <>Showing opportunities that fit your {[me.province && "province", me.sector && "sector", me.stage && "stage"].filter(Boolean).join(", ") || "profile"}. <Link href="/opportunities" className="font-semibold text-mph underline">Show all</Link></> : <>Showing all open opportunities. <Link href="/opportunities?mine=1" className="font-semibold text-mph underline">Show only what fits me</Link></>}
            {(!me.province || !me.stage) && <> · <Link href="/account/profile" className="font-semibold text-mph underline">Complete your profile</Link> for better matches.</>}
          </p>
        ) : <p className="mb-4 text-muted"><Link href="/join" className="font-semibold text-mph underline">Join free</Link> to see opportunities matched to your province, sector and stage, plus members-only programs.</p>}
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,1fr)_auto]">
          <select name="kind" defaultValue={sp.kind ?? ""} className="input" aria-label="Type"><option value="">All types</option>{Object.entries(OPPORTUNITY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="province" defaultValue={sp.province ?? ""} className="input" aria-label="Province"><option value="">All provinces</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select>
          <select name="sector" defaultValue={sp.sector ?? ""} className="input" aria-label="Sector"><option value="">All sectors</option>{SECTORS.map((x) => <option key={x}>{x}</option>)}</select>
          <select name="stage" defaultValue={sp.stage ?? ""} className="input" aria-label="Stage"><option value="">All stages</option>{STAGE_KEYS.map((k) => <option key={k} value={k}>{STAGES[k].label}</option>)}</select>
          <button className="btn btn-primary">Filter</button>
        </form>
        <div className="mt-6">
          {rows.length === 0 ? (
            mine && all.length ? (
              <EmptyState title="None of the open opportunities fit your profile yet." text="There are other opportunities open now. Take a look, or complete your profile for better matches." cta={{ href: "/opportunities", label: "Show all opportunities" }} />
            ) : (
              <EmptyState title={all.length ? "Nothing matches these filters." : "New opportunities are coming soon."} text={all.length ? "Try fewer filters, or check back next week." : "FLAME PH posts grants, trade fairs and buyer requests here. Check back next week."} cta={all.length ? { href: "/opportunities", label: "Clear filters" } : undefined} />
            )
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {rows.map((o) => {
                const soon = o.deadline && new Date(`${o.deadline}T23:59:59+08:00`).getTime() - Date.now() < 7 * 86400000;
                return (
                  <li key={o.id} className="card flex flex-col p-5">
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-primary">{OPPORTUNITY_KINDS[o.kind] ?? "Opportunity"}</span>
                      <span className="rounded-full bg-bg-soft px-2.5 py-0.5 text-muted">{o.province || "Nationwide"}</span>
                      {o.members_only && <span className="rounded-full bg-flame-soft px-2.5 py-0.5 text-flame-strong">Members only</span>}
                    </div>
                    <h2 className="mt-2 text-lg font-bold">{o.title}</h2>
                    {o.organizer && <p className="text-sm text-muted">by {o.organizer}</p>}
                    {o.summary && <p className="mt-2 whitespace-pre-line text-[15px]">{o.summary}</p>}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <p className={`text-sm font-semibold ${soon ? "text-flame-strong" : "text-muted"}`}>{o.deadline ? `Apply by ${dateLabel(o.deadline)}` : o.starts_on ? `Starts ${dateLabel(o.starts_on)}` : "Open"}</p>
                      {o.url && /^https?:\/\//.test(o.url) && <a href={o.url} target="_blank" rel="noopener" className="btn btn-outline min-h-9 px-3 text-sm">Details ↗</a>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
