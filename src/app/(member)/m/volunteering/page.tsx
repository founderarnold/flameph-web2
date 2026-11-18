import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { TabShell } from "@/components/shell/TabShell";
import { SubmissionForm } from "@/components/SubmissionForm";
import { FORMS } from "@/lib/forms";
import { INVOLVED, getInvolved } from "@/content/involved";
import { focusRegionOf } from "@/lib/regions";

export const metadata = { title: "Volunteering" };

const VOLUNTEER = ["mentor", "resource-speaker", "professional-services", "chapter-leader"];
const OTHER = ["partner", "sponsor-event", "sponsor-community", "poverty-alleviation"];

/**
 * Volunteering for signed-in members (members see this at /volunteering; visitors keep the public page).
 * Reuses the existing Get involved pages and their forms; adds the member's own chapter and region.
 */
export default async function VolunteeringTab() {
  const { supabase, user } = await requireUser("/volunteering");
  const { data: profile } = await supabase.from("profiles").select("province, chapter_id").eq("id", user.id).maybeSingle();
  const { data: chapter } = profile?.chapter_id
    ? await supabase.from("chapters").select("id, name, status, leader_name").eq("id", profile.chapter_id).eq("published", true).maybeSingle()
    : { data: null };
  const region = focusRegionOf(profile?.province);
  const other = INVOLVED.filter((p) => OTHER.includes(p.slug) && p.status === "live");

  return (
    <TabShell title="Volunteering" fil="Mag-volunteer"
      intro="Share your time and skills with Filipino entrepreneurs. Volunteering also builds your portfolio and your name in the community.">
      {chapter && !chapter.leader_name && (
        <section aria-labelledby="v-chapter" className="card border-2 border-flame p-4">
          <h2 id="v-chapter" className="text-lg font-bold">Your chapter needs a leader</h2>
          <p className="mt-1 text-sm text-muted">{chapter.name}{chapter.status === "forming" ? " is just forming." : " has no leader listed yet."} A chapter leader gathers local members and runs meetups with the FLAME PH team.</p>
          <Link href="/get-involved/chapter-leader" className="btn btn-primary mt-3 min-h-11">Lead {chapter.name}</Link>
        </section>
      )}

      <section aria-labelledby="v-roles" className="space-y-3">
        <h2 id="v-roles" className="text-lg font-bold">Ways to volunteer</h2>
        <ul className="space-y-3">
          {VOLUNTEER.map((slug) => {
            const p = getInvolved(slug);
            return (
              <li key={slug}>
                <Link href={`/get-involved/${slug}`} className="card block p-4 hover:border-primary">
                  <p className="text-xs font-bold uppercase text-flame-strong">{p.fil}</p>
                  <h3 className="text-base font-bold text-primary">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.intro}</p>
                  <span className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Apply</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {region && (
        <section aria-labelledby="v-region" className="card p-4">
          <h2 id="v-region" className="text-lg font-bold">Events near you</h2>
          <p className="mt-1 text-sm text-muted">Workshops and chapter events in {region.name} need mentors, speakers and helpers.</p>
          <Link href={`/chapters/${region.slug}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">See {region.name} chapters and events</Link>
        </section>
      )}

      <section aria-labelledby="v-other" className="card p-4">
        <h2 id="v-other" className="text-lg font-bold">Other ways to help</h2>
        <ul className="mt-1 divide-y divide-line">
          {other.map((p) => (
            <li key={p.slug}><Link href={`/get-involved/${p.slug}`} className="flex min-h-11 items-center py-2 font-semibold hover:underline">{p.title}</Link></li>
          ))}
          <li><Link href="/resources" className="flex min-h-11 items-center py-2 font-semibold hover:underline">Guides and templates you can share</Link></li>
        </ul>
      </section>

      <section aria-label="Not sure yet?" className="card p-4"><SubmissionForm def={FORMS.volunteer} /></section>

      <p><Link href="/volunteering?view=public" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Public Volunteering page</Link></p>
    </TabShell>
  );
}
