import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { list } from "@/lib/content";
import { INDUSTRIES } from "@/lib/industries";
import { PROVINCES } from "@/content/ph-provinces";
import { STAGES, STAGE_KEYS } from "@/lib/growth";
import { STEPS, STEP_TITLES, stepOf, type Step } from "@/lib/onboarding";
import { followingIds, peopleCards, suggestedPeople } from "@/lib/suggestions";
import { saveChapter, saveIndustries, saveLocation, saveOnboardingProfile, skipOnboarding } from "@/app/account/onboarding-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";

export const metadata = { title: "Welcome" };

type Chapter = { id: string; name: string; region: string | null; province: string | null; city: string | null; status: string };

/** First-run onboarding: industries, chapter, follow members, finish the profile. Every step can be skipped. */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ step?: string; error?: string; where?: string }> }) {
  const sp = await searchParams;
  const step = stepOf(sp.step);
  const { supabase, user } = await requireUser(`/welcome?step=${step}`);
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const n = STEPS.indexOf(step) + 1;
  const next: Step | null = STEPS[n] ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <p className="text-sm font-semibold text-muted">Step {n} of {STEPS.length}</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5" aria-hidden>{STEPS.map((s, i) => <span key={s} className={`h-1.5 rounded-full ${i < n ? "bg-primary" : "bg-line"}`} />)}</div>
        <h1 className="mt-4 text-2xl font-extrabold">{STEP_TITLES[step]}</h1>
      </div>
      {sp.error === "province" ? <Notice tone="danger">Please choose your province.</Notice> : sp.error && <Notice tone="danger">That didn&apos;t save. Please try again. If it keeps happening, skip this step for now and finish it later from your feed.</Notice>}

      {step === "industries" && (
        <form action={saveIndustries} className="space-y-4">
          <p className="text-muted">Pick as many as you like. We use these to suggest members, opportunities and posts.</p>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Industries</legend>
            {INDUSTRIES.map((i) => (
              <label key={i.name} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="checkbox" name="industry" value={i.name} defaultChecked={(p?.industries ?? []).includes(i.name)} className="h-5 w-5" />
                <span className="font-semibold">{i.name}</span>
              </label>
            ))}
          </fieldset>
          <SubmitButton className="btn btn-primary w-full">Next</SubmitButton>
        </form>
      )}

      {step === "chapter" && <ChapterStep supabase={supabase} userId={user.id} p={p} where={sp.where === "1"} />}

      {step === "follow" && <FollowStep userId={user.id} supabase={supabase} p={p} />}

      {step === "profile" && (
        <form action={saveOnboardingProfile} className="space-y-4">
          <div><label className="label" htmlFor="ob-name">Your full name</label><input id="ob-name" name="full_name" autoComplete="name" maxLength={120} defaultValue={p?.full_name ?? ""} className="input" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="ob-prov">Province</label>
              <select id="ob-prov" name="province" defaultValue={p?.province ?? ""} className="input"><option value="">Choose…</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label className="label" htmlFor="ob-city">City or municipality</label><input id="ob-city" name="city" maxLength={120} defaultValue={p?.city ?? ""} className="input" /></div>
          </div>
          <fieldset>
            <legend className="label">Where is your business now?</legend>
            <div className="grid gap-2">
              {STAGE_KEYS.map((k) => (
                <label key={k} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="business_stage" value={k} defaultChecked={p?.business_stage === k} className="mt-1 h-5 w-5" />
                  <span><span className="block font-semibold">{STAGES[k].label}</span><span className="block text-sm text-muted">{STAGES[k].blurb}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton className="btn btn-primary w-full">Finish and go to my feed</SubmitButton>
          <p className="text-sm text-muted">Next, you can <Link href="/account/business" className="text-primary underline">list your business</Link> from your feed.</p>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {next ? <Link href={`/welcome?step=${next}`} className="btn btn-ghost min-h-11">Not now</Link> : <span />}
        <form action={skipOnboarding}><button className="btn btn-ghost min-h-11 text-muted">Skip setup, go to my feed</button></form>
      </div>
    </div>
  );
}

type Home = { id: string; name: string; slug: string | null; province: string | null; city: string | null; status: string; created: boolean };
type Catalog = { slug: string; name: string; sector: string; priority: boolean; sort: number };
type Supa = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Where the member's business is, asked here when the profile has no province yet (it decides the local chapter). */
function LocationForm({ province, city }: { province: string | null; city: string | null }) {
  return (
    <form action={saveLocation} className="card space-y-4 p-4">
      <p className="text-muted">Tell us where your business is, and we&apos;ll put you in your local chapter.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="loc-prov">Province</label>
          <select id="loc-prov" name="province" required defaultValue={province ?? ""} className="input min-h-11"><option value="">Choose…</option>{PROVINCES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label" htmlFor="loc-city">City or municipality</label><input id="loc-city" name="city" maxLength={120} defaultValue={city ?? ""} autoComplete="address-level2" className="input min-h-11" /></div>
      </div>
      <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Finding your chapter…">Show my chapter</SubmitButton>
    </form>
  );
}

/**
 * Step 2. The local chapter comes from the province and city in the member's profile, already chosen for them
 * (a forming chapter is opened for their province when there is none yet). Below it, industry chapters they can join too.
 */
async function ChapterStep({ supabase, userId, p, where }: { supabase: Supa; userId: string; p: Record<string, unknown> | null; where: boolean }) {
  const province = (p?.province as string | null) ?? null;
  const city = (p?.city as string | null) ?? null;
  const current = (p?.chapter_id as string | null) ?? null;
  const industries = (p?.industries as string[] | null) ?? [];
  if (!province || where) return <LocationForm province={province} city={city} />;

  const [{ data: homeRows }, chapters, { data: catalog }, { data: mine }] = await Promise.all([
    supabase.rpc("home_chapter"),
    list<Chapter>({ table: "chapters", order: "name", ascending: true }),
    supabase.from("group_catalog").select("slug, name, sector, priority, sort").order("sort").limit(200),
    supabase.from("group_members").select("community_groups(slug)").eq("user_id", userId),
  ]);
  const home = ((homeRows ?? []) as Home[])[0] ?? null;
  const others = chapters.filter((c) => c.status !== "inactive" && c.id !== home?.id)
    .sort((a, b) => Number(b.province === province) - Number(a.province === province));
  const chosen = current ?? home?.id ?? null;
  const joined = new Set(((mine ?? []) as unknown as { community_groups: { slug: string } | null }[]).map((r) => r.community_groups?.slug).filter(Boolean));
  const fits = (g: Catalog) => industries.includes(g.sector) || industries.some((i) => g.name.toLowerCase().startsWith(i.toLowerCase().split(" ")[0]));
  const groups = ((catalog ?? []) as Catalog[]).sort((a, b) => Number(fits(b)) - Number(fits(a)) || Number(b.priority) - Number(a.priority) || a.sort - b.sort);
  const place = [city, province].filter(Boolean).join(", ");

  return (
    <form action={saveChapter} className="space-y-5">
      <section aria-labelledby="ch-local" className="space-y-2">
        <h2 id="ch-local" className="text-lg font-bold">Your local chapter</h2>
        <p className="text-sm text-muted">Based on your profile: <strong className="text-fg">{place}</strong>. <Link href="/welcome?step=chapter&where=1" className="font-semibold text-primary underline">Change</Link></p>
        {home ? (
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
            <input type="radio" name="chapter_id" value={home.id} defaultChecked={chosen === home.id} className="mt-1 h-5 w-5" />
            <span><span className="block font-semibold">{home.name}</span>
              <span className="block text-sm text-muted">{[home.city, home.province].filter(Boolean).join(", ")}{home.status === "forming" ? " · Forming: be one of the first members" : ""}</span></span>
          </label>
        ) : (
          <Notice tone="info">We couldn&apos;t find a chapter for {place} yet. <Link href="/get-involved/chapter-leader" className="underline">Start one in your area</Link>, or skip for now.</Notice>
        )}
        {others.length > 0 && (
          <details className="rounded-xl border border-line p-3">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Choose a different chapter</summary>
            <fieldset className="mt-2 grid gap-2">
              <legend className="sr-only">Other chapters</legend>
              {others.map((c) => (
                <label key={c.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="chapter_id" value={c.id} defaultChecked={chosen === c.id} className="mt-1 h-5 w-5" />
                  <span><span className="block font-semibold">{c.name}</span><span className="block text-sm text-muted">{[c.city, c.province, c.region].filter(Boolean).join(", ")}{c.status === "forming" ? " · forming" : ""}</span></span>
                </label>
              ))}
            </fieldset>
          </details>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm text-muted">
          <input type="radio" name="chapter_id" value="" defaultChecked={!chosen} className="h-5 w-5" /><span>No local chapter for now</span>
        </label>
      </section>

      {groups.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-lg font-bold">Industry chapters <span className="text-sm font-normal text-muted">(optional, pick any)</span></legend>
          <p className="text-sm text-muted">Meet members in the same line of business anywhere in the Philippines. Their posts show in your feed.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((g) => (
              <label key={g.slug} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="hidden" name="shown_group" value={g.slug} />
                <input type="checkbox" name="industry_group" value={g.slug} defaultChecked={joined.has(g.slug)} className="h-5 w-5" />
                <span><span className="block font-semibold">{g.name}</span>{fits(g) && <span className="block text-xs font-semibold text-primary">Fits your industries</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <SubmitButton className="btn btn-primary min-h-11 w-full" pendingText="Saving…">Join and continue</SubmitButton>
    </form>
  );
}

async function FollowStep({ userId, supabase, p }: { userId: string; supabase: Supa; p: Record<string, unknown> | null }) {
  const following = await followingIds(supabase, userId);
  const [suggested, followed] = await Promise.all([
    suggestedPeople(supabase, userId, { industries: p?.industries as string[] | undefined, chapter_id: p?.chapter_id as string | undefined, province: p?.province as string | undefined }, 12, { exclude: following }),
    peopleCards(supabase, [...following].slice(0, 12).map((user_id) => ({ user_id }))),
  ]);
  // People just followed stay on the screen (as "Following") so the list doesn't jump.
  const people = [...followed, ...suggested].slice(0, Math.max(12, followed.length));
  return (
    <div className="space-y-4">
      <p className="text-muted">Members near you, in your chapter and in your industries. Follow them to see their posts in your feed. You follow {following.size} so far.</p>
      {people.length === 0 ? (
        <Notice tone="info">No suggestions yet. Members appear here as more people join near you and in your industries.</Notice>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {people.map((b) => <li key={b.id}><SuggestedMemberCard b={b} following={following.has(b.owner_id)} back="/welcome?step=follow" /></li>)}
        </ul>
      )}
      <Link href="/welcome?step=profile" className="btn btn-primary min-h-11 w-full">Next</Link>
    </div>
  );
}
