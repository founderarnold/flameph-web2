import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { STAGES, STAGE_KEYS, type Stage } from "@/lib/growth";
import { StagePicker } from "@/components/StagePicker";
import { toggleMilestone } from "../actions";

export default async function Growth() {
  const { supabase, user } = await requireUser("/account/growth");
  const [{ data: p }, { data: ms, error }] = await Promise.all([
    supabase.from("profiles").select("business_stage").eq("id", user.id).single(),
    supabase.from("member_milestones").select("key").eq("user_id", user.id),
  ]);
  const done = new Set((ms ?? []).map((m) => m.key));
  const current = (p?.business_stage ?? null) as Stage | null;
  const idx = current ? STAGE_KEYS.indexOf(current) : -1;
  const curStage = current ? STAGES[current] : null;
  const curDone = curStage ? curStage.milestones.filter((m) => done.has(m.key)).length : 0;
  const next = idx >= 0 && idx < STAGE_KEYS.length - 1 ? STAGE_KEYS[idx + 1] : null;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-extrabold text-primary">Your growth path</h1>
        <p className="mt-2 text-muted">From your first idea to selling abroad. Tick what you&apos;ve done; we use your stage to match opportunities, trainings and deals.</p>
      </div>

      {!current ? (
        <section className="card max-w-2xl p-5">
          <h2 className="text-xl font-extrabold">Nasaan na ang negosyo mo?</h2>
          <StagePicker back="/account/growth" />
        </section>
      ) : (
        <section className="card max-w-2xl p-5">
          <p className="text-sm font-bold uppercase text-flame-strong">You&apos;re in the {curStage!.label} stage</p>
          <p className="mt-1 text-lg font-bold">{curDone} of {curStage!.milestones.length} milestones done</p>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(4, Math.round((curDone / curStage!.milestones.length) * 100))}%` }} /></div>
          {next && curDone === curStage!.milestones.length && (
            <div className="mt-4 rounded-xl bg-ok-soft p-4">
              <p className="font-bold text-ok">Galing! You&apos;ve finished this stage.</p>
              <p className="mt-1 text-sm">Ready to move to <b>{STAGES[next].label}</b>?</p>
              <StagePicker back="/account/growth" only={[next]} />
            </div>
          )}
          <p className="mt-3 text-sm"><Link href="/opportunities" className="font-semibold text-mph underline">See opportunities for your stage</Link> · <Link href="/bizconsult-ai" className="font-semibold text-mph underline">Ask FLAME AI what to do next</Link></p>
        </section>
      )}

      {error && <p className="text-sm text-muted">Milestone checkboxes open once FLAME PH finishes a database update.</p>}

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STAGE_KEYS.map((k, i) => {
          const st = STAGES[k];
          const here = k === current;
          return (
            <li key={k} className={`card flex flex-col p-4 ${here ? "border-2 border-flame" : i < idx ? "opacity-90" : ""}`}>
              <p className="text-xs font-bold uppercase text-flame-strong">Stage {i + 1}{here && " · You are here"}</p>
              <h2 className="text-lg font-extrabold text-primary">{st.label}</h2>
              <p className="text-sm text-muted">{st.fil}. {st.blurb}</p>
              <ul className="mt-3 space-y-2">
                {st.milestones.map((m) => {
                  const isDone = done.has(m.key);
                  return (
                    <li key={m.key}>
                      <form action={toggleMilestone} className="flex items-start gap-2">
                        <input type="hidden" name="key" value={m.key} /><input type="hidden" name="done" value={isDone ? "0" : "1"} />
                        <button disabled={Boolean(error)} aria-pressed={isDone} aria-label={`${isDone ? "Untick" : "Tick"}: ${m.label}`}
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 text-sm font-bold ${isDone ? "border-ok bg-ok text-white" : "border-line"}`}>{isDone ? "✓" : ""}</button>
                        <span className={`text-sm ${isDone ? "text-muted line-through" : ""}`}>
                          {m.href ? <Link href={m.href} className="underline-offset-2 hover:underline">{m.label}</Link> : m.label}
                        </span>
                      </form>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-auto border-t border-dashed border-line pt-3 text-xs text-muted">Unlocks: {st.unlocks}</p>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-muted">Milestones are self-reported and private to you. To show a Verified badge on your listing, upload your registration documents in <Link href="/account/business" className="underline">My business</Link>.</p>
    </div>
  );
}
