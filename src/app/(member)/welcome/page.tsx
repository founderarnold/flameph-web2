import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { list } from "@/lib/content";
import { INDUSTRIES } from "@/lib/industries";
import { PROVINCES } from "@/content/ph-provinces";
import { STAGES, STAGE_KEYS } from "@/lib/growth";
import { STEPS, STEP_TITLES, stepOf, type Step } from "@/lib/onboarding";
import { followingIds, suggestedMembers } from "@/lib/suggestions";
import { saveChapter, saveIndustries, saveOnboardingProfile, skipOnboarding } from "@/app/account/onboarding-actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";
import { SuggestedMemberCard } from "@/components/shell/MemberCard";

export const metadata = { title: "Welcome" };

type Chapter = { id: string; name: string; region: string | null; province: string | null; city: string | null; status: string };

/** First-run onboarding: industries, chapter, follow members, finish the profile. Every step can be skipped. */
export default async function Welcome({ searchParams }: { searchParams: Promise<{ step?: string; error?: string }> }) {
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
      {sp.error && <Notice tone="danger">That didn&apos;t save. Please try again. If it keeps happening, skip this step for now and finish it later from your feed.</Notice>}

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

      {step === "chapter" && <ChapterStep current={p?.chapter_id ?? null} province={p?.province ?? null} />}

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

async function ChapterStep({ current, province }: { current: string | null; province: string | null }) {
  const chapters = (await list<Chapter>({ table: "chapters", order: "name", ascending: true })).filter((c) => c.status !== "inactive");
  const sorted = [...chapters].sort((a, b) => Number(b.province === province) - Number(a.province === province));
  return (
    <form action={saveChapter} className="space-y-4">
      <p className="text-muted">Chapters are local groups of entrepreneurs led by volunteers. {province ? `Chapters in ${province} are listed first.` : ""}</p>
      {sorted.length === 0 ? (
        <Notice tone="info">There is no chapter listed yet. You can skip this step, or <Link href="/get-involved/chapter-leader" className="underline">start one in your area</Link>.</Notice>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="sr-only">Chapters</legend>
          {sorted.map((c) => (
            <label key={c.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="radio" name="chapter_id" value={c.id} defaultChecked={current === c.id} className="mt-1 h-5 w-5" />
              <span><span className="block font-semibold">{c.name}</span><span className="block text-sm text-muted">{[c.city, c.province, c.region].filter(Boolean).join(", ")}{c.status === "forming" ? " · forming" : ""}</span></span>
            </label>
          ))}
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line p-3 has-[:checked]:border-primary">
            <input type="radio" name="chapter_id" value="" defaultChecked={!current} className="h-5 w-5" /><span>No chapter for now</span>
          </label>
        </fieldset>
      )}
      <SubmitButton className="btn btn-primary w-full">Next</SubmitButton>
    </form>
  );
}

async function FollowStep({ userId, supabase, p }: { userId: string; supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]; p: Record<string, unknown> | null }) {
  const [people, following] = await Promise.all([
    suggestedMembers(userId, { industries: p?.industries as string[] | undefined, chapter_id: p?.chapter_id as string | undefined, province: p?.province as string | undefined }, 8),
    followingIds(supabase, userId),
  ]);
  return (
    <div className="space-y-4">
      <p className="text-muted">These MSMEs match your industries and area. You follow {following.size} so far.</p>
      {people.length === 0 ? (
        <Notice tone="info">No suggestions yet. More members appear here as businesses are listed.</Notice>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {people.map((b) => <li key={b.id}><SuggestedMemberCard b={b} following={following.has(b.owner_id)} back="/welcome?step=follow" /></li>)}
        </ul>
      )}
      <Link href="/welcome?step=profile" className="btn btn-primary w-full">Next</Link>
    </div>
  );
}
