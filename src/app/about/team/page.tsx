import Link from "next/link";
import { PageHero, Section } from "@/components/ui";
import { PersonCard } from "@/components/PersonCard";
import { getFounders } from "@/lib/founders";
import { list } from "@/lib/content";
import { meta } from "@/lib/meta";

export const metadata = meta("Meet the Teams", "The FLAME PH founders, team members and volunteers.", "/about/team");

type T = { id: string; name: string; role: string | null; bio: string | null; photo_path: string | null };

export default async function Page() {
  const [founders, team] = await Promise.all([getFounders(), list<T>({ table: "team_members", order: "sort", ascending: true })]);
  return (
    <>
      <PageHero status="live" fil="Ang aming koponan" title="Meet the Teams" path="/about/team" intro="The people behind FLAME PH." />
      <Section title="Leadership">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{founders.map((f) => <PersonCard key={f.name} name={f.name} title={f.title} photo={f.photo_path} />)}</div>
      </Section>
      <Section title="Team & volunteers">
        {team.length === 0 ? <p className="text-muted">Our team and volunteers will be introduced here as they join and agree to be listed.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{team.map((m) => <PersonCard key={m.id} name={m.name} title={m.role} bio={m.bio} photo={m.photo_path} />)}</div>
        )}
        <div className="mt-8 rounded-2xl bg-primary-soft p-6">
          <h2 className="text-xl font-extrabold text-primary">Join the team</h2>
          <p className="mt-1">We need volunteers for events, content, tech and community work.</p>
          <Link href="/volunteering" className="btn btn-primary mt-4">See volunteer roles</Link>
        </div>
      </Section>
    </>
  );
}
