// FLAME Academy progress for members. Pure rules, shared by the member Academy page, its action and the tests.
// A finished course is stored as a growth-path milestone (member_milestones, key "course:<course id>"), so progress
// lives in the same private, self-reported place as the growth path and counts the same way on the Rewards page.

import { STAGE_KEYS, STAGES, type Stage } from "@/lib/growth";

export type Course = { id: string; title: string; stage: string | null; summary: string | null; url: string | null };

export const TRACKS: { key: Stage; name: string; text: string }[] = [
  { key: "discover", name: "Discover", text: "Testing an idea and knowing your customer." },
  { key: "start", name: "Start", text: "Registering, pricing and opening for business." },
  { key: "build", name: "Build", text: "Bookkeeping, cash flow and simple systems." },
  { key: "grow", name: "Grow", text: "Marketing, online selling and wholesale." },
  { key: "scale", name: "Scale", text: "Financing, compliance and new markets." },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The milestone key for a finished course (null for anything that is not a course id). */
export const courseKey = (id: string) => (UUID.test(id) ? `course:${id.toLowerCase()}` : null);

/** Course progress, overall and for each track, plus the member's growth-path milestones for their stage. */
export function academyProgress(courses: Course[], doneKeys: Iterable<string>, stage: string | null) {
  const done = new Set(doneKeys);
  const isDone = (c: Course) => done.has(courseKey(c.id) ?? "");
  const tracks = TRACKS.map((t) => {
    const items = courses.filter((c) => c.stage === t.key);
    return { ...t, items, done: items.filter(isDone).length, here: t.key === stage };
  });
  const st = stage && (STAGE_KEYS as string[]).includes(stage) ? STAGES[stage as Stage] : null;
  return {
    total: courses.length,
    finished: courses.filter(isDone).length,
    tracks,
    isDone,
    stage: st ? { label: st.label, done: st.milestones.filter((m) => done.has(m.key)).length, of: st.milestones.length } : null,
  };
}

/** Whole percent, never more than 100. */
export const pct = (n: number, of: number) => (of > 0 ? Math.min(100, Math.round((n / of) * 100)) : 0);
