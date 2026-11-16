// First-run onboarding: the steps in order. Each step page is /welcome?step=<key>.
export const STEPS = ["industries", "chapter", "follow", "profile"] as const;
export type Step = (typeof STEPS)[number];

export const STEP_TITLES: Record<Step, string> = {
  industries: "Which industries are you in or interested in?",
  chapter: "Pick your chapter",
  follow: "Follow members to see their updates",
  profile: "Finish your profile",
};

export const stepOf = (v?: string | null): Step => (STEPS as readonly string[]).includes(v ?? "") ? (v as Step) : "industries";
