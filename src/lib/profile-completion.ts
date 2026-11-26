import { businessCompletion } from "@/lib/business-completion";
import { validPlace } from "@/lib/ph-towns";

export type CompletionStep = { key: string; label: string; help: string; href: string; done: boolean };

type Profile = { full_name?: string | null; province?: string | null; city?: string | null; business_stage?: string | null; industries?: string[] | null; chapter_id?: string | null } | null;
type Business = (Record<string, unknown> & { photos?: string[] | null }) | null;

const has = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : Boolean(v);

/**
 * Everything a member's profile needs, in the order we ask for it, with the exact page to fix each item.
 * Reuses the directory's business checks (business-completion.ts) for the business part.
 */
export function memberCompletion({ profile, business, follows, emailVerified }: { profile: Profile; business: Business; follows: number; emailVerified: boolean }) {
  const p = profile ?? {};
  const steps: CompletionStep[] = [
    { key: "email", label: "Confirm your email", help: "So members and buyers can trust you. We send a code to your email.", href: "/account/business", done: emailVerified },
    { key: "name", label: "Add your full name", help: "Members and buyers see who they are dealing with.", href: "/welcome?step=profile", done: has(p.full_name) },
    { key: "location", label: "Choose your province and city", help: "Pick them from the lists. We use them to find members and opportunities near you.", href: "/account/profile", done: validPlace(p.province ?? "", p.city ?? "") },
    { key: "stage", label: "Choose your business stage", help: "So we can show the right trainings and opportunities.", href: "/welcome?step=profile", done: has(p.business_stage) },
    { key: "industries", label: "Pick the industries you care about", help: "Your feed and suggestions follow these.", href: "/welcome?step=industries", done: (p.industries?.length ?? 0) > 0 },
    { key: "chapter", label: "Join a chapter", help: "Your local group of FLAME PH entrepreneurs.", href: "/welcome?step=chapter", done: has(p.chapter_id) },
    { key: "follow", label: "Follow 3 members", help: `You follow ${follows} so far. Their updates will show in your feed.`, href: "/welcome?step=follow", done: follows >= 3 },
    { key: "business", label: "List your business (free)", help: "Get your own business profile in the FLAME PH directory.", href: "/account/business", done: Boolean(business) },
  ];
  if (business) {
    const check = businessCompletion(business, p.full_name ?? "", emailVerified);
    for (const c of check.checks.filter((x) => x.key !== "representative" && !(x.key === "verified_contact" && !emailVerified))) {
      steps.push({ key: `biz-${c.key}`, label: `Business: ${c.label.toLowerCase()}`, help: c.help, href: "/account/business", done: c.done });
    }
    steps.push({ key: "biz-industry", label: "Business: specific industry", help: "Pick the closest type of business, so the right members find you.", href: "/account/business#details", done: has(business.subsector) || business.sector === "Other" });
  }
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100), complete: done === steps.length, next: steps.filter((s) => !s.done) };
}
